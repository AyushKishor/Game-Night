import { z } from "zod";
import { REVEAL_SECONDS, deadlineFrom, nameOf, pushLog, resultsFromScores, zeroScores } from "@/lib/engine/helpers";
import type { GameContext, GameModule, PlayerId, RoundSummary } from "@/lib/engine/types";
import { SIP_RULE, pickIndices } from "../shared/party";

export interface RankItState {
  players: PlayerId[];
  sets: number[];
  round: number;
  ranker: PlayerId;
  phase: "rank" | "guess" | "reveal" | "over";
  /** Item order as displayed (indices into the prompt set's items). */
  display: number[];
  order: number[] | null;
  guesses: Record<PlayerId, number[]>;
  scores: Record<PlayerId, number>;
  last: { order: number[]; guesses: Record<PlayerId, number[]>; gained: Record<PlayerId, number> } | null;
  summaries: RoundSummary[];
  deadline: number | null;
  log: string[];
}

const perm = z
  .array(z.number().int().min(0).max(4))
  .length(5)
  .refine((a) => new Set(a).size === 5, "Use each item once");
const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("rank"), order: perm }),
  z.object({ type: z.literal("guess"), order: perm }),
  z.object({ type: z.literal("next") }),
]);
type Action = z.infer<typeof actionSchema>;

const guessers = (s: RankItState) => s.players.filter((p) => p !== s.ranker);

function startRound(state: RankItState, round: number, ctx: GameContext): RankItState {
  return {
    ...state,
    round,
    ranker: state.players[(round - 1) % state.players.length]!,
    phase: "rank",
    display: ctx.rng.shuffle([0, 1, 2, 3, 4]),
    order: null,
    guesses: {},
    deadline: deadlineFrom(ctx.now, ctx.config.roundSeconds),
  };
}

function reveal(state: RankItState, ctx: GameContext): RankItState {
  const order = state.order ?? state.display;
  const gained: Record<PlayerId, number> = zeroScores(state.players);
  let predictable = 0;
  for (const p of guessers(state)) {
    const g = state.guesses[p];
    if (!g) continue;
    const hits = g.filter((item, i) => order[i] === item).length;
    gained[p] = hits;
    if (hits >= 3) predictable++;
  }
  gained[state.ranker] = predictable;
  const scores = Object.fromEntries(state.players.map((p) => [p, state.scores[p]! + gained[p]!]));
  const summary: RoundSummary = {
    round: state.round,
    title: `${nameOf(ctx, state.ranker)}'s ranking revealed`,
    lines: state.players.map((p) => `${nameOf(ctx, p)}: +${gained[p]}`),
    scores: gained,
  };
  return {
    ...state,
    order,
    phase: "reveal",
    scores,
    last: { order, guesses: state.guesses, gained },
    summaries: [...state.summaries, summary],
    deadline: deadlineFrom(ctx.now, REVEAL_SECONDS + 4),
    log: pushLog(state.log, summary.title),
  };
}

function next(state: RankItState, ctx: GameContext): RankItState {
  if (state.round >= state.sets.length) return { ...state, phase: "over", deadline: null };
  return startRound(state, state.round + 1, ctx);
}

export const rankIt: GameModule<RankItState, Action> = {
  meta: {
    id: "rank-it",
    name: "Rank It",
    tagline: "One player ranks five things. Everyone else reads their mind.",
    category: "party",
    minPlayers: 3,
    maxPlayers: 10,
    duration: "10–20 min",
    icon: "ListOrdered",
    accent: "coral",
    supportsBots: true,
    rules: {
      goal: "Predict how your friends think.",
      steps: [
        "Each round, one player is the Ranker. A topic and five items appear, like “Best pizza toppings”.",
        "The Ranker secretly puts the five items in order from best to worst.",
        "Everyone else tries to guess the Ranker's exact order.",
        "The Ranker's order is revealed and points are handed out. The Ranker role rotates each round.",
      ],
      scoring: "Guessers score 1 point per item in the right position. The Ranker scores 1 point for each guesser who got at least 3 right.",
      ending: "Most points after the set number of rounds wins; ties share the win.",
    },
  },
  settings: ["rounds", "roundSeconds"],
  houseRules: [SIP_RULE],
  presets: { quick: { rounds: 3, roundSeconds: 45 }, standard: { rounds: 6, roundSeconds: 60 }, long: { rounds: 10, roundSeconds: 75 } },
  actionSchema,

  setup: (players, ctx) =>
    startRound(
      {
        players,
        sets: pickIndices(ctx.content.rankIt.sets.length, ctx.config.rounds, ctx.rng),
        round: 1,
        ranker: players[0]!,
        phase: "rank",
        display: [0, 1, 2, 3, 4],
        order: null,
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
    if (action.type === "rank") {
      if (state.phase !== "rank") return "Ranking is closed.";
      return player === state.ranker ? null : "Only the Ranker orders the list this round.";
    }
    if (state.phase !== "guess") return "Wait for the Ranker.";
    if (player === state.ranker) return "You're the Ranker — sit tight!";
    if (state.guesses[player]) return "You've already guessed.";
    return null;
  },
  apply(state, player, action, ctx) {
    if (action.type === "next") return next(state, ctx);
    if (action.type === "rank") {
      return { ...state, order: action.order, phase: "guess", deadline: deadlineFrom(ctx.now, ctx.config.roundSeconds), log: pushLog(state.log, `${nameOf(ctx, player)} has ranked. Now guess!`) };
    }
    const s = { ...state, guesses: { ...state.guesses, [player]: action.order } };
    return guessers(s).every((p) => s.guesses[p]) ? reveal(s, ctx) : s;
  },
  pending(state) {
    if (state.phase === "rank") return [state.ranker];
    if (state.phase === "guess") return guessers(state).filter((p) => !state.guesses[p]);
    return [];
  },
  deadline: (state) => (state.phase === "over" ? null : state.deadline),
  onTimeout(state, ctx) {
    if (state.phase === "rank") return { ...state, order: ctx.rng.shuffle([0, 1, 2, 3, 4]), phase: "guess", deadline: deadlineFrom(ctx.now, ctx.config.roundSeconds) };
    if (state.phase === "guess") return reveal(state, ctx);
    return next(state, ctx);
  },
  botAction(state, player, ctx) {
    if (state.phase === "rank" && player === state.ranker) return { type: "rank", order: ctx.rng.shuffle([0, 1, 2, 3, 4]) };
    if (state.phase === "guess" && player !== state.ranker && !state.guesses[player]) return { type: "guess", order: ctx.rng.shuffle([0, 1, 2, 3, 4]) };
    return null;
  },
  isOver: (state) => state.phase === "over",
  results: (state, ctx) => resultsFromScores(state.scores, ctx, { order: state.players }),
  roundSummaries: (state) => state.summaries,

  publicView(state, ctx): RankItPublic {
    const set = ctx.content.rankIt.sets[state.sets[state.round - 1]!]!;
    return {
      players: state.players,
      round: state.round,
      total: state.sets.length,
      phase: state.phase,
      ranker: state.ranker,
      prompt: set.prompt,
      items: set.items,
      display: state.display,
      guessed: guessers(state).filter((p) => state.guesses[p]),
      last: state.phase === "reveal" || state.phase === "over" ? state.last : null,
      scores: state.scores,
      log: state.log,
    };
  },
  privateView(state, player): RankItPrivate {
    return {
      myOrder: player === state.ranker ? state.order : (state.guesses[player] ?? null),
      isRanker: player === state.ranker,
    };
  },
};

export interface RankItPublic {
  players: PlayerId[];
  round: number;
  total: number;
  phase: RankItState["phase"];
  ranker: PlayerId;
  prompt: string;
  items: string[];
  display: number[];
  guessed: PlayerId[];
  last: RankItState["last"];
  scores: Record<PlayerId, number>;
  log: string[];
}
export interface RankItPrivate {
  myOrder: number[] | null;
  isRanker: boolean;
}
