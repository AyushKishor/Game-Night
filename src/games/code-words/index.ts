import { z } from "zod";
import { deadlineFrom, nameOf, pushLog, resultsFromScores } from "@/lib/engine/helpers";
import type { GameContext, GameModule, PlayerId } from "@/lib/engine/types";
import { SPICY_RULE } from "../shared/party";
import { BOT_CLUES, SPICY_WORDS, WORDS } from "./words";

/** Codenames-style team word game. */
export type Team = 0 | 1;
export type Tile = "A" | "B" | "N" | "X";
export const TEAM_LABELS = ["Red", "Blue"] as const;
const tileOf = (t: Team): Tile => (t === 0 ? "A" : "B");

export interface CodeWordsState {
  players: PlayerId[];
  teams: Record<PlayerId, Team>;
  spymasters: [PlayerId, PlayerId];
  words: string[];
  key: Tile[];
  revealed: boolean[];
  turnTeam: Team;
  phase: "clue" | "guess" | "over";
  clue: { word: string; number: number; team: Team } | null;
  guessesLeft: number;
  deadline: number | null;
  winner: Team | null;
  endReason: string | null;
  lastPick: { index: number; by: PlayerId } | null;
  log: string[];
}

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("clue"), word: z.string().trim().min(1).max(24), number: z.number().int().min(0).max(9) }),
  z.object({ type: z.literal("guess"), index: z.number().int().min(0).max(24) }),
  z.object({ type: z.literal("end-guessing") }),
]);
type Action = z.infer<typeof actionSchema>;

export const left = (s: Pick<CodeWordsState, "key" | "revealed">, t: Team) =>
  s.key.filter((k, i) => k === tileOf(t) && !s.revealed[i]).length;

function guessers(s: CodeWordsState, t: Team) {
  return s.players.filter((p) => s.teams[p] === t && !s.spymasters.includes(p));
}

function clueError(s: CodeWordsState, raw: string): string | null {
  const w = raw.trim().toUpperCase();
  if (!/^[A-Z][A-Z'-]*$/.test(w)) return "Your clue must be one word (letters only).";
  for (let i = 0; i < 25; i++) {
    if (s.revealed[i]) continue;
    const b = s.words[i]!.toUpperCase().replace(/ /g, "");
    if (b === w || b.includes(w) || w.includes(b)) return `"${w}" is too close to a word on the board.`;
  }
  return null;
}

/** Never make the host a spymaster when avoidable — their screen is usually the TV. */
function spymastersFor(players: PlayerId[], teams: Record<PlayerId, Team>, host: PlayerId): [PlayerId, PlayerId] {
  const pick = (t: Team) => {
    const team = players.filter((p) => teams[p] === t);
    return team.find((p) => p !== host) ?? team[0]!;
  };
  return [pick(0), pick(1)];
}

function switchTeam(s: CodeWordsState, ctx: GameContext) {
  s.turnTeam = s.turnTeam === 0 ? 1 : 0;
  s.phase = "clue";
  s.clue = null;
  s.guessesLeft = 0;
  s.deadline = deadlineFrom(ctx.now, ctx.config.roundSeconds);
}

function win(s: CodeWordsState, t: Team, reason: string) {
  s.phase = "over";
  s.winner = t;
  s.endReason = reason;
  s.deadline = null;
  s.log = pushLog(s.log, `🏆 ${TEAM_LABELS[t]} team wins — ${reason}`);
}

export const codeWords: GameModule<CodeWordsState, Action> = {
  meta: {
    id: "code-words",
    name: "Code Words",
    tagline: "Codenames rules: one-word clues, secret agents, don't touch the assassin.",
    category: "party",
    minPlayers: 4,
    maxPlayers: 12,
    duration: "15–20 min",
    icon: "Grid3x3",
    accent: "sky",
    supportsBots: true,
    rules: {
      goal: "Find all of your team's secret agents on the 25-word board before the other team does.",
      steps: [
        "Two teams, Red and Blue. Each team has one spymaster — only spymasters see the secret key on their phones.",
        "The spymaster gives a one-word clue and a number, e.g. \"OCEAN 3\", linking that many of their team's words. The clue can't be a word on the board.",
        "Their team talks it over and taps words. A correct word lets them keep going (up to the number + 1).",
        "Tap a neutral bystander or the other team's word and your turn ends. Tap the assassin and your team loses instantly.",
        "Red starts and has 9 words to find; Blue has 8.",
      ],
      scoring: "The winning team's players each get the win.",
      ending: "First team to uncover all their words wins — or the team that avoided the assassin.",
    },
  },
  settings: ["roundSeconds"],
  houseRules: [{ ...SPICY_RULE, description: "Mixes party and bedroom words into the board." }],
  presets: {
    quick: { roundSeconds: 90 },
    standard: { roundSeconds: 120 },
    long: { roundSeconds: 180 },
  },
  actionSchema: actionSchema as unknown as z.ZodType<Action>,

  setup(players, ctx) {
    const teams = Object.fromEntries(players.map((p, i) => [p, (i % 2) as Team]));
    const pool = [...new Set((ctx.config.houseRules.spicy ?? true) ? [...WORDS, ...SPICY_WORDS] : WORDS)];
    let words = ctx.rng.shuffle(pool).slice(0, 25);
    if (ctx.config.houseRules.spicy ?? true) {
      // Guarantee a few spicy words on the board.
      const spicy = ctx.rng.shuffle(SPICY_WORDS.filter((w) => !words.includes(w))).slice(0, 4);
      words = ctx.rng.shuffle([...words.slice(0, 25 - spicy.length), ...spicy]);
    }
    const key = ctx.rng.shuffle<Tile>([...Array(9).fill("A"), ...Array(8).fill("B"), ...Array(7).fill("N"), "X"]);
    return {
      players,
      teams,
      spymasters: spymastersFor(players, teams, ctx.hostId),
      words,
      key,
      revealed: Array(25).fill(false),
      turnTeam: 0,
      phase: "clue",
      clue: null,
      guessesLeft: 0,
      deadline: deadlineFrom(ctx.now, ctx.config.roundSeconds),
      winner: null,
      endReason: null,
      lastPick: null,
      log: [],
    };
  },

  validate(s, player, a) {
    if (s.phase === "over") return "The game is over.";
    if (a.type === "clue") {
      if (s.phase !== "clue") return "Clue already given.";
      if (s.spymasters[s.turnTeam] !== player) return "Only this team's spymaster gives the clue.";
      return clueError(s, a.word);
    }
    if (s.phase !== "guess") return "Waiting for the clue.";
    if (!guessers(s, s.turnTeam).includes(player)) return "It's not your team's turn to guess.";
    if (a.type === "guess" && s.revealed[a.index]) return "That word is already uncovered.";
    return null;
  },

  apply(state, player, a, ctx) {
    const s = structuredClone(state);
    const team = s.turnTeam;
    if (a.type === "clue") {
      const word = a.word.trim().toUpperCase();
      s.clue = { word, number: a.number, team };
      s.phase = "guess";
      s.guessesLeft = a.number === 0 ? 25 : a.number + 1;
      s.deadline = deadlineFrom(ctx.now, ctx.config.roundSeconds);
      s.log = pushLog(s.log, `${TEAM_LABELS[team]} clue: ${word} ${a.number === 0 ? "∞" : a.number}`);
      return s;
    }
    if (a.type === "end-guessing") {
      s.log = pushLog(s.log, `${TEAM_LABELS[team]} stopped guessing.`);
      switchTeam(s, ctx);
      return s;
    }
    s.revealed[a.index] = true;
    s.lastPick = { index: a.index, by: player };
    const tile = s.key[a.index]!;
    const word = s.words[a.index]!;
    const who = nameOf(ctx, player);
    const other: Team = team === 0 ? 1 : 0;
    if (tile === "X") {
      s.log = pushLog(s.log, `💀 ${who} picked ${word} — the ASSASSIN!`);
      win(s, other, `${TEAM_LABELS[team]} hit the assassin.`);
      return s;
    }
    if (tile === tileOf(team)) {
      s.log = pushLog(s.log, `✅ ${who} found ${word}.`);
      if (left(s, team) === 0) win(s, team, "all agents found!");
      else if (--s.guessesLeft <= 0) switchTeam(s, ctx);
      return s;
    }
    s.log = pushLog(
      s.log,
      tile === "N" ? `😐 ${who} picked ${word} — a bystander.` : `❌ ${who} picked ${word} — that's ${TEAM_LABELS[other]}'s!`,
    );
    if (tile === tileOf(other) && left(s, other) === 0) win(s, other, "the other team found their last agent for them!");
    else switchTeam(s, ctx);
    return s;
  },

  pending(s) {
    if (s.phase === "over") return [];
    return s.phase === "clue" ? [s.spymasters[s.turnTeam]] : guessers(s, s.turnTeam);
  },
  deadline: (s) => (s.phase === "over" ? null : s.deadline),
  onTimeout(s, ctx) {
    if (s.phase === "guess") {
      const next = structuredClone(s);
      next.log = pushLog(next.log, `⏰ ${TEAM_LABELS[s.turnTeam]} ran out of time.`);
      switchTeam(next, ctx);
      return next;
    }
    const a = codeWords.botAction(s, s.spymasters[s.turnTeam], ctx)!;
    return codeWords.apply(s, s.spymasters[s.turnTeam], a, ctx);
  },

  botAction(s, player, ctx) {
    if (!codeWords.pending(s).includes(player)) return null;
    if (s.phase === "clue") {
      const word = ctx.rng.shuffle(BOT_CLUES).find((w) => !clueError(s, w)) ?? "HMM";
      return { type: "clue", word, number: 1 };
    }
    const hidden = s.words.map((_, i) => i).filter((i) => !s.revealed[i]);
    // Bots "understand" the clue about half the time.
    const mine = hidden.filter((i) => s.key[i] === tileOf(s.turnTeam));
    const clueUsed = s.clue && s.guessesLeft <= (s.clue.number === 0 ? 24 : s.clue.number);
    if (clueUsed && ctx.rng.next() < 0.5) return { type: "end-guessing" };
    const safe = hidden.filter((i) => s.key[i] !== "X");
    const r = ctx.rng.next();
    const pick = mine.length && r < 0.55 ? ctx.rng.pick(mine) : ctx.rng.pick(r > 0.97 || !safe.length ? hidden : safe);
    return { type: "guess", index: pick };
  },

  isOver: (s) => s.phase === "over",
  results(s, ctx) {
    const scores = Object.fromEntries(s.players.map((p) => [p, s.winner !== null && s.teams[p] === s.winner ? 1 : 0]));
    const res = resultsFromScores(scores, ctx, { order: s.players });
    if (s.winner !== null) res.summary = `${TEAM_LABELS[s.winner]} team wins — ${s.endReason}`;
    return res;
  },
  roundSummaries: () => [],

  publicView(s): CodeWordsPublic {
    return {
      players: s.players,
      teams: s.teams,
      spymasters: s.spymasters,
      words: s.words,
      revealedKey: s.key.map((k, i) => (s.revealed[i] || s.phase === "over" ? k : null)),
      revealed: s.revealed,
      turnTeam: s.turnTeam,
      phase: s.phase,
      clue: s.clue,
      guessesLeft: s.guessesLeft,
      left: [left(s, 0), left(s, 1)],
      winner: s.winner,
      endReason: s.endReason,
      lastPick: s.lastPick,
      log: s.log,
    };
  },
  privateView(s, player): CodeWordsPrivate | null {
    if (!s.players.includes(player)) return null;
    const spy = s.spymasters.includes(player);
    return { team: s.teams[player]!, spymaster: spy, key: spy ? s.key : null };
  },
};

export interface CodeWordsPublic {
  players: PlayerId[];
  teams: Record<PlayerId, Team>;
  spymasters: [PlayerId, PlayerId];
  words: string[];
  revealedKey: (Tile | null)[];
  revealed: boolean[];
  turnTeam: Team;
  phase: CodeWordsState["phase"];
  clue: CodeWordsState["clue"];
  guessesLeft: number;
  left: [number, number];
  winner: Team | null;
  endReason: string | null;
  lastPick: CodeWordsState["lastPick"];
  log: string[];
}
export interface CodeWordsPrivate {
  team: Team;
  spymaster: boolean;
  key: Tile[] | null;
}
