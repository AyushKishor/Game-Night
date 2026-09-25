import { z } from "zod";
import { REVEAL_SECONDS, deadlineFrom, pushLog, resultsFromScores, zeroScores } from "@/lib/engine/helpers";
import type { GameContext, GameModule, PlayerId, RoundSummary } from "@/lib/engine/types";
import { SIP_RULE, pickIndices } from "../shared/party";

type Side = "a" | "b";

export interface MajorityState {
  players: PlayerId[];
  questions: number[];
  round: number;
  phase: "vote" | "reveal" | "over";
  votes: Record<PlayerId, Side>;
  scores: Record<PlayerId, number>;
  summaries: RoundSummary[];
  deadline: number | null;
  log: string[];
}

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("vote"), side: z.enum(["a", "b"]) }),
  z.object({ type: z.literal("next") }),
]);
type Action = z.infer<typeof actionSchema>;

function question(state: MajorityState, ctx: { content: GameContext["content"] }) {
  return ctx.content.majorityRules.questions[state.questions[state.round - 1]!]!;
}

function reveal(state: MajorityState, ctx: GameContext): MajorityState {
  const a = state.players.filter((p) => state.votes[p] === "a");
  const b = state.players.filter((p) => state.votes[p] === "b");
  const winners = a.length > b.length ? a : b.length > a.length ? b : [];
  const q = question(state, ctx);
  const scores = { ...state.scores };
  for (const p of winners) scores[p]! += 1;
  const summary: RoundSummary = {
    round: state.round,
    title: winners.length ? `The majority chose “${a.length > b.length ? q.a : q.b}”` : "It's a tie — no points!",
    lines: [`${q.a}: ${a.length}`, `${q.b}: ${b.length}`],
    scores: Object.fromEntries(state.players.map((p) => [p, winners.includes(p) ? 1 : 0])),
  };
  return {
    ...state,
    phase: "reveal",
    scores,
    summaries: [...state.summaries, summary],
    deadline: deadlineFrom(ctx.now, REVEAL_SECONDS),
    log: pushLog(state.log, summary.title),
  };
}

function next(state: MajorityState, ctx: GameContext): MajorityState {
  if (state.round >= state.questions.length) return { ...state, phase: "over", deadline: null };
  return { ...state, round: state.round + 1, phase: "vote", votes: {}, deadline: deadlineFrom(ctx.now, ctx.config.roundSeconds) };
}

export const majorityRules: GameModule<MajorityState, Action> = {
  meta: {
    id: "majority-rules",
    name: "Majority Rules",
    tagline: "Pick a side. Score by agreeing with the crowd.",
    category: "party",
    minPlayers: 3,
    maxPlayers: 12,
    duration: "5–15 min",
    icon: "Vote",
    accent: "amber",
    supportsBots: true,
    supportsJoinInProgress: true,
    rules: {
      goal: "Think like the group.",
      steps: [
        "A question with two options appears on the big screen.",
        "Everyone secretly picks an option on their phone.",
        "When everyone has voted (or time runs out) the votes are revealed.",
        "Everyone on the bigger side scores a point. A tie scores nothing.",
      ],
      scoring: "1 point for being in the majority.",
      ending: "Most points after the set number of questions wins; ties share the win.",
    },
  },
  settings: ["rounds", "roundSeconds", "allowJoinInProgress"],
  houseRules: [SIP_RULE],
  presets: {
    quick: { rounds: 5, roundSeconds: 20, allowJoinInProgress: true },
    standard: { rounds: 10, roundSeconds: 25, allowJoinInProgress: true },
    long: { rounds: 20, roundSeconds: 30, allowJoinInProgress: true },
  },
  actionSchema,

  setup: (players, ctx) => ({
    players,
    questions: pickIndices(ctx.content.majorityRules.questions.length, ctx.config.rounds, ctx.rng),
    round: 1,
    phase: "vote",
    votes: {},
    scores: zeroScores(players),
    summaries: [],
    deadline: deadlineFrom(ctx.now, ctx.config.roundSeconds),
    log: [],
  }),

  validate(state, player, action, ctx) {
    if (action.type === "next") {
      if (state.phase !== "reveal") return "Nothing to continue.";
      return player === ctx.hostId ? null : "Only the host can continue.";
    }
    if (state.phase !== "vote") return "Voting is closed.";
    if (state.votes[player]) return "You've already voted.";
    return null;
  },
  apply(state, player, action, ctx) {
    if (action.type === "next") return next(state, ctx);
    const s = { ...state, votes: { ...state.votes, [player]: action.side } };
    return state.players.every((p) => s.votes[p]) ? reveal(s, ctx) : s;
  },
  pending: (state) => (state.phase === "vote" ? state.players.filter((p) => !state.votes[p]) : []),
  deadline: (state) => (state.phase === "over" ? null : state.deadline),
  onTimeout: (state, ctx) => (state.phase === "vote" ? reveal(state, ctx) : next(state, ctx)),
  botAction: (state, player, ctx) => (state.phase === "vote" && !state.votes[player] ? { type: "vote", side: ctx.rng.next() < 0.5 ? "a" : "b" } : null),
  isOver: (state) => state.phase === "over",
  results: (state, ctx) => resultsFromScores(state.scores, ctx, { order: state.players }),
  roundSummaries: (state) => state.summaries,
  addPlayer: (state, player) => ({ ...state, players: [...state.players, player], scores: { ...state.scores, [player]: 0 } }),

  publicView(state, ctx): MajorityPublic {
    const q = question(state, ctx);
    return {
      players: state.players,
      round: state.round,
      total: state.questions.length,
      phase: state.phase,
      question: q.q,
      a: q.a,
      b: q.b,
      voted: state.players.filter((p) => state.votes[p]),
      votes: state.phase === "vote" ? null : state.votes,
      scores: state.scores,
      log: state.log,
    };
  },
  privateView: (state, player) => ({ vote: state.votes[player] ?? null }),
};

export interface MajorityPublic {
  players: PlayerId[];
  round: number;
  total: number;
  phase: MajorityState["phase"];
  question: string;
  a: string;
  b: string;
  voted: PlayerId[];
  votes: Record<PlayerId, Side> | null;
  scores: Record<PlayerId, number>;
  log: string[];
}
