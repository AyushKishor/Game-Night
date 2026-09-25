import { z } from "zod";
import { REVEAL_SECONDS, deadlineFrom, nameOf, pushLog, resultsFromScores, zeroScores } from "@/lib/engine/helpers";
import type { GameContext, GameModule, PlayerId, RoundSummary } from "@/lib/engine/types";
import { CLUE_MAX } from "@/lib/shared/text";
import { SIP_RULE, checkText } from "../shared/party";
import { playerIdSchema } from "../shared/schemas";

export interface SecretSignalState {
  players: PlayerId[];
  round: number;
  rounds: number;
  phase: "clue" | "guess" | "reveal" | "over";
  symbolOf: Record<PlayerId, string>;
  partnerOf: Record<PlayerId, PlayerId | null>;
  clues: Record<PlayerId, string>;
  guesses: Record<PlayerId, PlayerId>;
  scores: Record<PlayerId, number>;
  last: {
    symbols: Record<PlayerId, string>;
    partners: Record<PlayerId, PlayerId | null>;
    guesses: Record<PlayerId, PlayerId>;
    gained: Record<PlayerId, number>;
  } | null;
  summaries: RoundSummary[];
  deadline: number | null;
  log: string[];
}

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("clue"), text: z.string().max(60) }),
  z.object({ type: z.literal("guess"), target: playerIdSchema }),
  z.object({ type: z.literal("next") }),
]);
type Action = z.infer<typeof actionSchema>;

const needsGuess = (s: SecretSignalState) => s.players.filter((p) => s.partnerOf[p]);

function deal(state: SecretSignalState, round: number, ctx: GameContext): SecretSignalState {
  const order = ctx.rng.shuffle(state.players);
  const symbols = ctx.rng.shuffle(ctx.content.secretSignal.symbols.map((s) => s.name));
  const symbolOf: Record<PlayerId, string> = {};
  const partnerOf: Record<PlayerId, PlayerId | null> = {};
  for (let i = 0; i + 1 < order.length; i += 2) {
    const [a, b] = [order[i]!, order[i + 1]!];
    symbolOf[a] = symbolOf[b] = symbols[i / 2]!;
    partnerOf[a] = b;
    partnerOf[b] = a;
  }
  if (order.length % 2 === 1) {
    const loner = order[order.length - 1]!;
    symbolOf[loner] = symbols[symbols.length - 1]!;
    partnerOf[loner] = null;
  }
  return {
    ...state,
    round,
    phase: "clue",
    symbolOf,
    partnerOf,
    clues: {},
    guesses: {},
    deadline: deadlineFrom(ctx.now, ctx.config.roundSeconds),
  };
}

function reveal(state: SecretSignalState, ctx: GameContext): SecretSignalState {
  const gained = zeroScores(state.players);
  for (const p of needsGuess(state)) {
    const guess = state.guesses[p];
    if (!guess) continue;
    const partner = state.partnerOf[p]!;
    if (guess === partner) {
      gained[p]! += 2;
      if (state.guesses[partner] === p) gained[p]! += 1;
    } else if (state.partnerOf[guess] === null) {
      gained[guess]! += 1; // the loner fooled someone
    }
  }
  const scores = Object.fromEntries(state.players.map((p) => [p, state.scores[p]! + gained[p]!]));
  const summary: RoundSummary = {
    round: state.round,
    title: `Signals revealed`,
    lines: state.players.map(
      (p) => `${nameOf(ctx, p)} — ${state.symbolOf[p]}${state.partnerOf[p] ? "" : " (loner)"}: +${gained[p]}`,
    ),
    scores: gained,
  };
  return {
    ...state,
    phase: "reveal",
    scores,
    last: { symbols: state.symbolOf, partners: state.partnerOf, guesses: state.guesses, gained },
    summaries: [...state.summaries, summary],
    deadline: deadlineFrom(ctx.now, REVEAL_SECONDS + 5),
    log: pushLog(state.log, summary.title),
  };
}

const toGuess = (state: SecretSignalState, ctx: GameContext): SecretSignalState => ({
  ...state,
  phase: "guess",
  clues: Object.fromEntries(state.players.map((p) => [p, state.clues[p] ?? "…"])),
  deadline: deadlineFrom(ctx.now, ctx.config.roundSeconds),
});

export const secretSignal: GameModule<SecretSignalState, Action> = {
  meta: {
    id: "secret-signal",
    name: "Secret Signal",
    tagline: "Find the player who shares your secret symbol — one word at a time.",
    category: "party",
    minPlayers: 4,
    maxPlayers: 12,
    duration: "10–20 min",
    icon: "Radio",
    accent: "violet",
    supportsBots: true,
    rules: {
      goal: "Find your secret partner without giving your symbol away to everyone.",
      steps: [
        "Each round, players are secretly paired up — partners share a hidden symbol, like “Volcano”. With an odd number of players, one person is the Loner with a symbol nobody shares.",
        "Everyone writes a one-word clue about their symbol (you can't use the symbol's name).",
        "All clues are shown together. Pick the player you think is your partner.",
        "The Loner tries to blend in and gets points if someone picks them.",
      ],
      scoring: "Find your partner: +2 (+1 bonus if you both find each other). The Loner gets +1 for every player who picks them.",
      ending: "Most points after the set number of rounds wins; ties share the win.",
    },
  },
  settings: ["rounds", "roundSeconds"],
  houseRules: [SIP_RULE],
  presets: {
    quick: { rounds: 2, roundSeconds: 45 },
    standard: { rounds: 4, roundSeconds: 60 },
    long: { rounds: 6, roundSeconds: 75 },
  },
  actionSchema,

  setup: (players, ctx) =>
    deal(
      {
        players,
        round: 1,
        rounds: ctx.config.rounds,
        phase: "clue",
        symbolOf: {},
        partnerOf: {},
        clues: {},
        guesses: {},
        scores: zeroScores(players),
        last: null,
        summaries: [],
        deadline: null,
        log: [],
      },
      1,
      ctx,
    ),

  validate(state, player, action, ctx) {
    if (action.type === "next") {
      if (state.phase !== "reveal") return "Nothing to continue.";
      return player === ctx.hostId ? null : "Only the host can continue.";
    }
    if (action.type === "clue") {
      if (state.phase !== "clue") return "Clues are locked in.";
      if (state.clues[player]) return "You've already given a clue.";
      const res = checkText(action.text, CLUE_MAX, ctx.config);
      if ("error" in res) return res.error;
      if (/\s/.test(res.text)) return "One word only!";
      if (res.text.toLowerCase().includes(state.symbolOf[player]!.toLowerCase())) return "You can't use the symbol itself.";
      return null;
    }
    if (state.phase !== "guess") return "It's not time to guess.";
    if (!state.partnerOf[player]) return "You're the Loner — just blend in!";
    if (state.guesses[player]) return "You've already guessed.";
    if (action.target === player || !state.players.includes(action.target)) return "Pick another player.";
    return null;
  },
  apply(state, player, action, ctx) {
    if (action.type === "next") {
      return state.round >= state.rounds ? { ...state, phase: "over", deadline: null } : deal(state, state.round + 1, ctx);
    }
    if (action.type === "clue") {
      const res = checkText(action.text, CLUE_MAX, ctx.config) as { text: string };
      const s = { ...state, clues: { ...state.clues, [player]: res.text } };
      return state.players.every((p) => s.clues[p]) ? toGuess(s, ctx) : s;
    }
    const s = { ...state, guesses: { ...state.guesses, [player]: action.target } };
    return needsGuess(s).every((p) => s.guesses[p]) ? reveal(s, ctx) : s;
  },
  pending(state) {
    if (state.phase === "clue") return state.players.filter((p) => !state.clues[p]);
    if (state.phase === "guess") return needsGuess(state).filter((p) => !state.guesses[p]);
    return [];
  },
  deadline: (state) => (state.phase === "over" ? null : state.deadline),
  onTimeout(state, ctx) {
    if (state.phase === "clue") return toGuess(state, ctx);
    if (state.phase === "guess") return reveal(state, ctx);
    return state.round >= state.rounds ? { ...state, phase: "over", deadline: null } : deal(state, state.round + 1, ctx);
  },
  botAction(state, player, ctx) {
    const symbol = ctx.content.secretSignal.symbols.find((s) => s.name === state.symbolOf[player]);
    if (state.phase === "clue" && !state.clues[player])
      return { type: "clue", text: symbol ? ctx.rng.pick(symbol.hints) : "thing" };
    if (state.phase === "guess" && state.partnerOf[player] && !state.guesses[player]) {
      const hints = (symbol?.hints ?? []).map((h) => h.toLowerCase());
      const others = state.players.filter((p) => p !== player);
      const match = others.find((p) => hints.includes((state.clues[p] ?? "").toLowerCase()));
      return { type: "guess", target: match ?? ctx.rng.pick(others) };
    }
    return null;
  },
  isOver: (state) => state.phase === "over",
  results: (state, ctx) => resultsFromScores(state.scores, ctx, { order: state.players }),
  roundSummaries: (state) => state.summaries,

  publicView(state): SecretSignalPublic {
    return {
      players: state.players,
      round: state.round,
      total: state.rounds,
      phase: state.phase,
      submitted: state.players.filter((p) => (state.phase === "clue" ? state.clues[p] : state.guesses[p])),
      clues: state.phase === "clue" ? null : state.clues,
      hasLoner: state.players.length % 2 === 1,
      last: state.phase === "reveal" || state.phase === "over" ? state.last : null,
      scores: state.scores,
      log: state.log,
    };
  },
  privateView: (state, player): SecretSignalPrivate => ({
    symbol: state.symbolOf[player] ?? null,
    isLoner: state.partnerOf[player] === null,
    clue: state.clues[player] ?? null,
    guess: state.guesses[player] ?? null,
  }),
};

export interface SecretSignalPublic {
  players: PlayerId[];
  round: number;
  total: number;
  phase: SecretSignalState["phase"];
  submitted: PlayerId[];
  clues: Record<PlayerId, string> | null;
  hasLoner: boolean;
  last: SecretSignalState["last"];
  scores: Record<PlayerId, number>;
  log: string[];
}
export interface SecretSignalPrivate {
  symbol: string | null;
  isLoner: boolean;
  clue: string | null;
  guess: PlayerId | null;
}
