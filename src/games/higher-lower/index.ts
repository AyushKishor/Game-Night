import { z } from "zod";
import { type CardId, cardLabel, rankValue, shuffledDeck } from "@/lib/engine/cards";
import { REVEAL_SECONDS, deadlineFrom, nameOf, pushLog, resultsFromScores, zeroScores } from "@/lib/engine/helpers";
import type { GameContext, GameModule, PlayerId, RoundSummary } from "@/lib/engine/types";
import { SIP_RULE } from "../shared/party";

type Guess = "higher" | "lower";

export interface HigherLowerState {
  players: PlayerId[];
  deck: CardId[];
  current: CardId;
  phase: "guess" | "reveal" | "over";
  guesses: Record<PlayerId, Guess>;
  round: number;
  scores: Record<PlayerId, number>;
  last: { from: CardId; to: CardId; guesses: Record<PlayerId, Guess>; correct: PlayerId[] } | null;
  summaries: RoundSummary[];
  deadline: number | null;
  log: string[];
}

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("guess"), guess: z.enum(["higher", "lower"]) }),
  z.object({ type: z.literal("next") }),
]);
type Action = z.infer<typeof actionSchema>;

function reveal(state: HigherLowerState, ctx: GameContext): HigherLowerState {
  let deck = state.deck;
  if (deck.length === 0) deck = shuffledDeck(ctx.rng, (c) => c !== state.current);
  const next = deck[0]!;
  const diff = rankValue(next, true) - rankValue(state.current, true);
  const answer: Guess | null = diff > 0 ? "higher" : diff < 0 ? "lower" : null;
  const correct = state.players.filter((p) => answer && state.guesses[p] === answer);
  const scores = { ...state.scores };
  for (const p of correct) scores[p]! += 1;
  const summary: RoundSummary = {
    round: state.round,
    title: answer ? `${cardLabel(next)} — ${answer}!` : `${cardLabel(next)} — same rank, nobody scores`,
    lines: correct.length ? [`Correct: ${correct.map((p) => nameOf(ctx, p)).join(", ")}`] : ["Nobody got it."],
    scores: Object.fromEntries(state.players.map((p) => [p, correct.includes(p) ? 1 : 0])),
  };
  return {
    ...state,
    deck: deck.slice(1),
    phase: "reveal",
    scores,
    last: { from: state.current, to: next, guesses: state.guesses, correct },
    current: next,
    summaries: [...state.summaries, summary],
    deadline: ctx.now + 5000,
    log: pushLog(state.log, summary.title),
  };
}

function nextRound(state: HigherLowerState, ctx: GameContext): HigherLowerState {
  if (state.round >= ctx.config.rounds) return { ...state, phase: "over", deadline: null };
  return { ...state, phase: "guess", guesses: {}, round: state.round + 1, deadline: deadlineFrom(ctx.now, ctx.config.roundSeconds) };
}

export const higherLower: GameModule<HigherLowerState, Action> = {
  meta: {
    id: "higher-lower",
    name: "Higher or Lower",
    tagline: "Will the next card be higher or lower? Everyone guesses at once.",
    category: "card",
    minPlayers: 1,
    maxPlayers: 12,
    duration: "5–10 min",
    icon: "ArrowUpDown",
    accent: "sky",
    supportsBots: true,
    supportsJoinInProgress: true,
    rules: {
      goal: "Predict the most cards correctly.",
      steps: [
        "A card is shown on the table.",
        "Everyone secretly picks Higher or Lower for the next card (aces are high).",
        "When everyone has locked in — or time runs out — the next card is revealed.",
        "If the next card has the same rank, nobody scores that round.",
      ],
      scoring: "One point per correct guess.",
      ending: "Most points after the set number of cards wins; ties share the win.",
    },
  },
  settings: ["rounds", "roundSeconds", "allowJoinInProgress"],
  houseRules: [SIP_RULE],
  presets: {
    quick: { rounds: 8, roundSeconds: 15, allowJoinInProgress: true },
    standard: { rounds: 15, roundSeconds: 20, allowJoinInProgress: true },
    long: { rounds: 25, roundSeconds: 25, allowJoinInProgress: true },
  },
  actionSchema,

  setup(players, ctx) {
    const deck = shuffledDeck(ctx.rng);
    return {
      players,
      deck: deck.slice(1),
      current: deck[0]!,
      phase: "guess",
      guesses: {},
      round: 1,
      scores: zeroScores(players),
      last: null,
      summaries: [],
      deadline: deadlineFrom(ctx.now, ctx.config.roundSeconds),
      log: [`First card: ${cardLabel(deck[0]!)}`],
    };
  },

  validate(state, player, action, ctx) {
    if (action.type === "next") {
      if (state.phase !== "reveal") return "Nothing to continue.";
      return player === ctx.hostId ? null : "Only the host can continue.";
    }
    if (state.phase !== "guess") return "Wait for the next card.";
    if (state.guesses[player]) return "You've already locked in.";
    return null;
  },

  apply(state, player, action, ctx) {
    if (action.type === "next") return nextRound(state, ctx);
    const guesses = { ...state.guesses, [player]: action.guess };
    const s = { ...state, guesses };
    return state.players.every((p) => guesses[p]) ? reveal(s, ctx) : s;
  },

  pending: (state) => (state.phase === "guess" ? state.players.filter((p) => !state.guesses[p]) : []),
  deadline: (state) => (state.phase === "over" ? null : state.deadline),
  onTimeout: (state, ctx) => (state.phase === "guess" ? reveal(state, ctx) : nextRound(state, ctx)),
  botAction: (state, player) =>
    state.phase === "guess" && !state.guesses[player] ? { type: "guess", guess: rankValue(state.current, true) <= 8 ? "higher" : "lower" } : null,

  isOver: (state) => state.phase === "over",
  results: (state, ctx) => resultsFromScores(state.scores, ctx, { order: state.players }),
  roundSummaries: (state) => state.summaries,
  addPlayer: (state, player) => ({ ...state, players: [...state.players, player], scores: { ...state.scores, [player]: 0 } }),

  publicView(state): HigherLowerPublic {
    return {
      players: state.players,
      current: state.current,
      phase: state.phase,
      lockedIn: state.players.filter((p) => state.guesses[p]),
      round: state.round,
      scores: state.scores,
      last: state.last,
      remaining: state.deck.length,
      log: state.log,
    };
  },
  privateView: (state, player) => ({ guess: state.guesses[player] ?? null }),
};

export interface HigherLowerPublic {
  players: PlayerId[];
  current: CardId;
  phase: HigherLowerState["phase"];
  lockedIn: PlayerId[];
  round: number;
  scores: Record<PlayerId, number>;
  last: HigherLowerState["last"];
  remaining: number;
  log: string[];
}
export interface HigherLowerPrivate {
  guess: Guess | null;
}
