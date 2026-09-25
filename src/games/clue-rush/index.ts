import { z } from "zod";
import { REVEAL_SECONDS, deadlineFrom, nameOf, pushLog, resultsFromScores } from "@/lib/engine/helpers";
import type { GameContext, GameModule, PlayerId, RoundSummary } from "@/lib/engine/types";
import { SIP_RULE, TEAM_NAMES } from "../shared/party";

type Result = "got" | "skip" | "buzz";

export interface ClueRushState {
  players: PlayerId[];
  teamOf: Record<PlayerId, number>;
  turn: number;
  totalTurns: number;
  phase: "ready" | "clue" | "turnEnd" | "over";
  deck: number[];
  cursor: number;
  turnWords: { card: number; result: Result }[];
  teamScores: [number, number];
  summaries: RoundSummary[];
  deadline: number | null;
  log: string[];
}

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("got") }),
  z.object({ type: z.literal("skip") }),
  z.object({ type: z.literal("buzz") }),
  z.object({ type: z.literal("next") }),
]);
type Action = z.infer<typeof actionSchema>;

export function giverFor(state: Pick<ClueRushState, "players" | "teamOf" | "turn">): PlayerId {
  const team = state.turn % 2;
  const members = state.players.filter((p) => state.teamOf[p] === team);
  return members[Math.floor(state.turn / 2) % members.length]!;
}

const activeTeam = (s: ClueRushState) => s.turn % 2;

function playerScores(s: ClueRushState) {
  return Object.fromEntries(s.players.map((p) => [p, s.teamScores[s.teamOf[p]!]!]));
}

function endTurn(state: ClueRushState, ctx: GameContext): ClueRushState {
  const team = activeTeam(state);
  const got = state.turnWords.filter((w) => w.result === "got").length;
  const buzzed = state.turnWords.filter((w) => w.result === "buzz").length;
  const delta = got - buzzed;
  const teamScores = state.teamScores.map((s, i) => (i === team ? s + delta : s)) as [number, number];
  const cards = ctx.content.clueRush.cards;
  const members = state.players.filter((p) => state.teamOf[p] === team);
  const summary: RoundSummary = {
    round: state.turn + 1,
    title: `${TEAM_NAMES[team]} scored ${delta >= 0 ? "+" : ""}${delta}`,
    lines: state.turnWords.map((w) => `${cards[w.card]!.word} — ${w.result === "got" ? "✓ got it" : w.result === "buzz" ? "✗ buzzed" : "skipped"}`),
    scores: Object.fromEntries(state.players.map((p) => [p, state.teamOf[p] === team ? delta : 0])),
    sips: delta > 0 ? state.players.filter((p) => state.teamOf[p] !== team) : members,
  };
  const over = state.turn + 1 >= state.totalTurns;
  return {
    ...state,
    teamScores,
    phase: over ? "over" : "turnEnd",
    summaries: [...state.summaries, summary],
    deadline: over ? null : deadlineFrom(ctx.now, REVEAL_SECONDS),
    log: pushLog(state.log, summary.title),
  };
}

export const clueRush: GameModule<ClueRushState, Action> = {
  meta: {
    id: "clue-rush",
    name: "Clue Rush",
    tagline: "Describe the word without saying the forbidden ones. Teams race the clock.",
    category: "party",
    minPlayers: 4,
    maxPlayers: 12,
    duration: "15–30 min",
    icon: "MessageSquareQuote",
    accent: "coral",
    supportsBots: false,
    rules: {
      goal: "Get your team to guess as many words as possible.",
      steps: [
        "Players split into two teams by seat. Teams take turns; the clue-giver rotates.",
        "Only the clue-giver's phone shows the word, plus a few forbidden words.",
        "Describe the word out loud without saying it or any forbidden word. Your team shouts guesses.",
        "Tap “Got it” when they get it, or “Skip” to move on. The other team sees the card too and can hit “Buzz” if you slip up.",
        "Play it as charades instead if you like: no talking, only acting!",
      ],
      scoring: "+1 for each word your team gets, −1 for each buzz. Skips are free.",
      ending: "After every player's turns, the higher-scoring team wins (everyone on it shares the win); ties share the win.",
    },
  },
  settings: ["rounds", "roundSeconds"],
  houseRules: [SIP_RULE],
  presets: { quick: { rounds: 2, roundSeconds: 45 }, standard: { rounds: 3, roundSeconds: 60 }, long: { rounds: 5, roundSeconds: 75 } },
  actionSchema,

  setup(players, ctx) {
    return {
      players,
      teamOf: Object.fromEntries(players.map((p, i) => [p, i % 2])),
      turn: 0,
      totalTurns: Math.max(2, ctx.config.rounds * 2),
      phase: "ready",
      deck: ctx.rng.shuffle(ctx.content.clueRush.cards.map((_, i) => i)),
      cursor: 0,
      turnWords: [],
      teamScores: [0, 0],
      summaries: [],
      deadline: deadlineFrom(ctx.now, 30),
      log: ["Teams are set!"],
    };
  },

  validate(state, player, action, ctx) {
    const giver = giverFor(state);
    switch (action.type) {
      case "next":
        if (state.phase !== "turnEnd") return "Nothing to continue.";
        return player === ctx.hostId ? null : "Only the host can continue.";
      case "start":
        if (state.phase !== "ready") return "The turn has already started.";
        return player === giver ? null : "Only the clue-giver can start.";
      case "got":
      case "skip":
        if (state.phase !== "clue") return "The clock isn't running.";
        return player === giver ? null : "Only the clue-giver can do that.";
      case "buzz":
        if (state.phase !== "clue") return "The clock isn't running.";
        return state.teamOf[player] !== activeTeam(state) ? null : "Only the other team can buzz.";
    }
  },

  apply(state, player, action, ctx) {
    switch (action.type) {
      case "next":
        return { ...state, turn: state.turn + 1, phase: "ready", turnWords: [], deadline: deadlineFrom(ctx.now, 30) };
      case "start":
        return { ...state, phase: "clue", deadline: deadlineFrom(ctx.now, ctx.config.roundSeconds || 60) };
      default: {
        const card = state.deck[state.cursor % state.deck.length]!;
        const s: ClueRushState = {
          ...state,
          cursor: state.cursor + 1,
          turnWords: [...state.turnWords, { card, result: action.type as Result }],
          log: action.type === "buzz" ? pushLog(state.log, `BUZZ! ${nameOf(ctx, player)} caught a forbidden word.`) : state.log,
        };
        return s;
      }
    }
  },

  pending: (state) => (state.phase === "ready" || state.phase === "clue" ? [giverFor(state)] : []),
  deadline: (state) => (state.phase === "over" ? null : state.deadline),
  onTimeout(state, ctx) {
    if (state.phase === "ready") return { ...state, phase: "clue", deadline: deadlineFrom(ctx.now, ctx.config.roundSeconds || 60) };
    if (state.phase === "clue") return endTurn(state, ctx);
    return { ...state, turn: state.turn + 1, phase: "ready", turnWords: [], deadline: deadlineFrom(ctx.now, 30) };
  },
  botAction(state, player, ctx) {
    if (player !== giverFor(state)) return null;
    if (state.phase === "ready") return { type: "start" };
    if (state.phase === "clue" && state.turnWords.length < 12) return { type: ctx.rng.next() < 0.6 ? "got" : "skip" };
    return null;
  },

  isOver: (state) => state.phase === "over",
  results: (state, ctx) => resultsFromScores(playerScores(state), ctx, { order: state.players }),
  roundSummaries: (state) => state.summaries,

  publicView(state, ctx): ClueRushPublic {
    const cards = ctx.content.clueRush.cards;
    return {
      players: state.players,
      teamOf: state.teamOf,
      teamNames: TEAM_NAMES.slice(0, 2),
      teamScores: state.teamScores,
      turn: state.turn + 1,
      totalTurns: state.totalTurns,
      phase: state.phase,
      giver: giverFor(state),
      activeTeam: activeTeam(state),
      got: state.turnWords.filter((w) => w.result === "got").length,
      buzzed: state.turnWords.filter((w) => w.result === "buzz").length,
      // Words are only shown publicly once the turn is over.
      finished: state.phase === "clue" ? [] : state.turnWords.map((w) => ({ word: cards[w.card]!.word, result: w.result })),
      scores: playerScores(state),
      log: state.log,
    };
  },
  privateView(state, player, ctx): ClueRushPrivate {
    const giver = giverFor(state);
    const role = player === giver ? "giver" : state.teamOf[player] === activeTeam(state) ? "guesser" : "watcher";
    const card = ctx.content.clueRush.cards[state.deck[state.cursor % state.deck.length]!]!;
    return { role, team: state.teamOf[player] ?? 0, card: state.phase === "clue" && role !== "guesser" ? card : null };
  },
};

export interface ClueRushPublic {
  players: PlayerId[];
  teamOf: Record<PlayerId, number>;
  teamNames: string[];
  teamScores: [number, number];
  turn: number;
  totalTurns: number;
  phase: ClueRushState["phase"];
  giver: PlayerId;
  activeTeam: number;
  got: number;
  buzzed: number;
  finished: { word: string; result: Result }[];
  scores: Record<PlayerId, number>;
  log: string[];
}
export interface ClueRushPrivate {
  role: "giver" | "guesser" | "watcher";
  team: number;
  card: { word: string; taboo: string[] } | null;
}
