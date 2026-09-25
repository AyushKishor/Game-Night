import { z } from "zod";
import { REVEAL_SECONDS, deadlineFrom, nameOf, pushLog, resultsFromScores, zeroScores } from "@/lib/engine/helpers";
import type { GameContext, GameModule, PlayerId, RoundSummary } from "@/lib/engine/types";
import { SIP_RULE } from "../shared/party";
import { playerIdSchema } from "../shared/schemas";

export interface MostLikelyState {
  players: PlayerId[];
  prompts: string[];
  round: number;
  phase: "vote" | "reveal" | "over";
  votes: Record<PlayerId, PlayerId>;
  scores: Record<PlayerId, number>;
  picked: Record<PlayerId, number>;
  summaries: RoundSummary[];
  deadline: number | null;
  log: string[];
}

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("vote"), target: playerIdSchema }),
  z.object({ type: z.literal("next") }),
]);
type Action = z.infer<typeof actionSchema>;

function reveal(state: MostLikelyState, ctx: GameContext): MostLikelyState {
  const tally: Record<PlayerId, number> = {};
  for (const t of Object.values(state.votes)) tally[t] = (tally[t] ?? 0) + 1;
  const max = Math.max(0, ...Object.values(tally));
  const chosen = max > 0 ? Object.keys(tally).filter((p) => tally[p] === max) : [];
  const gained = Object.fromEntries(state.players.map((p) => [p, chosen.includes(state.votes[p] ?? "") ? 1 : 0]));
  const scores = Object.fromEntries(state.players.map((p) => [p, state.scores[p]! + gained[p]!]));
  const picked = { ...state.picked };
  for (const p of chosen) picked[p] = (picked[p] ?? 0) + 1;
  const summary: RoundSummary = {
    round: state.round,
    title: chosen.length ? `The group says: ${chosen.map((p) => nameOf(ctx, p)).join(" & ")}` : "Nobody voted!",
    lines: Object.entries(tally)
      .sort((a, b) => b[1] - a[1])
      .map(([p, n]) => `${nameOf(ctx, p)}: ${n} vote${n === 1 ? "" : "s"}`),
    scores: gained,
    sips: chosen,
  };
  return {
    ...state,
    phase: "reveal",
    scores,
    picked,
    summaries: [...state.summaries, summary],
    deadline: deadlineFrom(ctx.now, REVEAL_SECONDS),
    log: pushLog(state.log, summary.title),
  };
}

function next(state: MostLikelyState, ctx: GameContext): MostLikelyState {
  if (state.round >= state.prompts.length) return { ...state, phase: "over", deadline: null };
  return { ...state, round: state.round + 1, phase: "vote", votes: {}, deadline: deadlineFrom(ctx.now, ctx.config.roundSeconds) };
}

export const mostLikely: GameModule<MostLikelyState, Action> = {
  meta: {
    id: "most-likely",
    name: "Most Likely To",
    tagline: "Who in the room is most likely to…? Vote and find out.",
    category: "party",
    minPlayers: 3,
    maxPlayers: 12,
    duration: "10–15 min",
    icon: "Target",
    accent: "rose",
    supportsBots: true,
    supportsJoinInProgress: true,
    rules: {
      goal: "Vote with the crowd — and try not to be the answer.",
      steps: [
        "A “Who is most likely to…” prompt appears on the big screen.",
        "Everyone secretly votes for a player (you can vote for yourself).",
        "Votes are revealed. The most-voted player is the group's pick.",
        "Turn on the Spicy house rule for grown-up prompts, and Sip mode for a drinking-game twist: the group's pick takes a sip.",
      ],
      scoring: "1 point if you voted for the player the group picked.",
      ending: "Most points after the set number of prompts wins; ties share the win.",
    },
  },
  settings: ["rounds", "roundSeconds", "allowJoinInProgress"],
  houseRules: [
    {
      key: "spicy",
      label: "Spicy prompts (adults)",
      description: "Adds cheeky prompts about dating and nights out.",
      default: false,
    },
    SIP_RULE,
  ],
  presets: {
    quick: { rounds: 6, roundSeconds: 20, allowJoinInProgress: true },
    standard: { rounds: 12, roundSeconds: 25, allowJoinInProgress: true },
    long: { rounds: 20, roundSeconds: 30, allowJoinInProgress: true },
  },
  actionSchema,

  setup(players, ctx) {
    const pool = ctx.config.houseRules.spicy
      ? [...ctx.content.mostLikely.spicy, ...ctx.content.mostLikely.classic]
      : ctx.content.mostLikely.classic;
    const prompts = ctx.config.houseRules.spicy
      ? ctx.rng.shuffle(pool).slice(0, ctx.config.rounds)
      : ctx.rng.shuffle(pool).slice(0, ctx.config.rounds);
    return {
      players,
      prompts,
      round: 1,
      phase: "vote",
      votes: {},
      scores: zeroScores(players),
      picked: {},
      summaries: [],
      deadline: deadlineFrom(ctx.now, ctx.config.roundSeconds),
      log: [],
    };
  },

  validate(state, player, action, ctx) {
    if (action.type === "next") {
      if (state.phase !== "reveal") return "Nothing to continue.";
      return player === ctx.hostId ? null : "Only the host can continue.";
    }
    if (state.phase !== "vote") return "Voting is closed.";
    if (state.votes[player]) return "You've already voted.";
    if (!state.players.includes(action.target)) return "Vote for someone who's playing.";
    return null;
  },
  apply(state, player, action, ctx) {
    if (action.type === "next") return next(state, ctx);
    const s = { ...state, votes: { ...state.votes, [player]: action.target } };
    return state.players.every((p) => s.votes[p]) ? reveal(s, ctx) : s;
  },
  pending: (state) => (state.phase === "vote" ? state.players.filter((p) => !state.votes[p]) : []),
  deadline: (state) => (state.phase === "over" ? null : state.deadline),
  onTimeout: (state, ctx) => (state.phase === "vote" ? reveal(state, ctx) : next(state, ctx)),
  botAction: (state, player, ctx) =>
    state.phase === "vote" && !state.votes[player]
      ? { type: "vote", target: ctx.rng.pick(state.players.filter((p) => p !== player)) }
      : null,
  isOver: (state) => state.phase === "over",
  results: (state, ctx) => resultsFromScores(state.scores, ctx, { order: state.players }),
  roundSummaries: (state) => state.summaries,
  addPlayer: (state, player) => ({ ...state, players: [...state.players, player], scores: { ...state.scores, [player]: 0 } }),

  publicView(state): MostLikelyPublic {
    return {
      players: state.players,
      round: state.round,
      total: state.prompts.length,
      phase: state.phase,
      prompt: state.prompts[state.round - 1]!,
      voted: state.players.filter((p) => state.votes[p]),
      votes: state.phase === "vote" ? null : state.votes,
      picked: state.picked,
      scores: state.scores,
      log: state.log,
    };
  },
  privateView: (state, player) => ({ vote: state.votes[player] ?? null }),
};

export interface MostLikelyPublic {
  players: PlayerId[];
  round: number;
  total: number;
  phase: MostLikelyState["phase"];
  prompt: string;
  voted: PlayerId[];
  votes: Record<PlayerId, PlayerId> | null;
  picked: Record<PlayerId, number>;
  scores: Record<PlayerId, number>;
  log: string[];
}
