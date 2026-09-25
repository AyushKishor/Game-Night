import { z } from "zod";
import { REVEAL_SECONDS, deadlineFrom, nameOf, pushLog, resultsFromScores, zeroScores } from "@/lib/engine/helpers";
import type { GameContext, GameModule, PlayerId, RoundSummary } from "@/lib/engine/types";

export interface NhieState {
  players: PlayerId[];
  prompts: string[];
  round: number;
  phase: "answer" | "reveal" | "over";
  answers: Record<PlayerId, { have: boolean; guess: number }>;
  scores: Record<PlayerId, number>;
  /** How many times each player has "had" — the night's most experienced. */
  confessions: Record<PlayerId, number>;
  last: { have: PlayerId[]; guesses: Record<PlayerId, number>; gained: Record<PlayerId, number> } | null;
  summaries: RoundSummary[];
  deadline: number | null;
  log: string[];
}

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("answer"), have: z.boolean(), guess: z.number().int().min(0).max(20) }),
  z.object({ type: z.literal("next") }),
]);
type Action = z.infer<typeof actionSchema>;

const DRINK_RULE = {
  key: "sips",
  label: "Drinking game (adults only)",
  description: "Everyone who HAS done it drinks. Any drink works — please drink responsibly.",
  default: true,
};

function reveal(state: NhieState, ctx: GameContext): NhieState {
  const have = state.players.filter((p) => state.answers[p]?.have);
  const gained: Record<PlayerId, number> = zeroScores(state.players);
  for (const p of state.players) {
    const a = state.answers[p];
    if (!a) continue;
    const off = Math.abs(a.guess - have.length);
    gained[p] = off === 0 ? 3 : off === 1 ? 1 : 0;
  }
  const scores = Object.fromEntries(state.players.map((p) => [p, state.scores[p]! + gained[p]!]));
  const confessions = { ...state.confessions };
  for (const p of have) confessions[p] = (confessions[p] ?? 0) + 1;
  const exact = state.players.filter((p) => gained[p] === 3);
  const summary: RoundSummary = {
    round: state.round,
    title:
      have.length === 0
        ? "Nobody's done it… allegedly 😇"
        : have.length === state.players.length
          ? "EVERYONE has done it 😂"
          : `${have.length} of you have 👀`,
    lines: [
      have.length ? `Guilty: ${have.map((p) => nameOf(ctx, p)).join(", ")}` : "Clean record all round.",
      exact.length ? `🎯 Nailed the number: ${exact.map((p) => nameOf(ctx, p)).join(", ")}` : "Nobody guessed the exact number.",
    ],
    scores: gained,
    sips: have,
  };
  return {
    ...state,
    phase: "reveal",
    scores,
    confessions,
    last: { have, guesses: Object.fromEntries(Object.entries(state.answers).map(([p, a]) => [p, a.guess])), gained },
    summaries: [...state.summaries, summary],
    deadline: deadlineFrom(ctx.now, REVEAL_SECONDS + 2),
    log: pushLog(state.log, summary.title),
  };
}

function next(state: NhieState, ctx: GameContext): NhieState {
  if (state.round >= state.prompts.length) return { ...state, phase: "over", deadline: null };
  return {
    ...state,
    round: state.round + 1,
    phase: "answer",
    answers: {},
    deadline: deadlineFrom(ctx.now, ctx.config.roundSeconds),
  };
}

export const neverHaveIEver: GameModule<NhieState, Action> = {
  meta: {
    id: "never-have-i-ever",
    name: "Never Have I Ever",
    tagline: "Confess in secret, guess how guilty the room is — then the guilty drink.",
    category: "party",
    minPlayers: 3,
    maxPlayers: 12,
    duration: "10–20 min",
    icon: "Beer",
    accent: "amber",
    supportsBots: true,
    supportsJoinInProgress: true,
    rules: {
      goal: "Read the room: guess how many people have done it.",
      steps: [
        "A “Never have I ever…” statement appears on the big screen.",
        "On your phone, secretly tap I HAVE or NEVER.",
        "Then guess how many people in the room (including you) have done it.",
        "The reveal shows who's guilty. With the drinking game on (default), everyone who has done it drinks.",
      ],
      scoring: "Guess the exact number: 3 points. Off by one: 1 point.",
      ending:
        "Most points after the set number of statements wins; ties share the win. The results also crown the night's most guilty player.",
    },
  },
  settings: ["rounds", "roundSeconds", "allowJoinInProgress"],
  houseRules: [DRINK_RULE],
  presets: {
    quick: { rounds: 8, roundSeconds: 25, allowJoinInProgress: true },
    standard: { rounds: 15, roundSeconds: 30, allowJoinInProgress: true },
    long: { rounds: 25, roundSeconds: 35, allowJoinInProgress: true },
  },
  actionSchema,

  setup: (players, ctx) => ({
    players,
    prompts: ctx.rng.shuffle(ctx.content.neverHaveIEver.prompts).slice(0, ctx.config.rounds),
    round: 1,
    phase: "answer",
    answers: {},
    scores: zeroScores(players),
    confessions: zeroScores(players),
    last: null,
    summaries: [],
    deadline: deadlineFrom(ctx.now, ctx.config.roundSeconds),
    log: [],
  }),

  validate(state, player, action, ctx) {
    if (action.type === "next") {
      if (state.phase !== "reveal") return "Nothing to continue.";
      return player === ctx.hostId ? null : "Only the host can continue.";
    }
    if (state.phase !== "answer") return "Answers are locked in.";
    if (state.answers[player]) return "You've already answered.";
    if (action.guess > state.players.length) return `There are only ${state.players.length} of you!`;
    if (action.have && action.guess < 1) return "You have — so at least 1 person has!";
    return null;
  },
  apply(state, player, action, ctx) {
    if (action.type === "next") return next(state, ctx);
    const s = { ...state, answers: { ...state.answers, [player]: { have: action.have, guess: action.guess } } };
    return state.players.every((p) => s.answers[p]) ? reveal(s, ctx) : s;
  },
  pending: (state) => (state.phase === "answer" ? state.players.filter((p) => !state.answers[p]) : []),
  deadline: (state) => (state.phase === "over" ? null : state.deadline),
  onTimeout: (state, ctx) => (state.phase === "answer" ? reveal(state, ctx) : next(state, ctx)),
  botAction(state, player, ctx) {
    if (state.phase !== "answer" || state.answers[player]) return null;
    const have = ctx.rng.next() < 0.45;
    const guess = Math.max(have ? 1 : 0, Math.round(state.players.length * (0.25 + ctx.rng.next() * 0.4)));
    return { type: "answer", have, guess: Math.min(guess, state.players.length) };
  },
  isOver: (state) => state.phase === "over",
  results: (state, ctx) => {
    const r = resultsFromScores(state.scores, ctx, { order: state.players });
    const top = Math.max(0, ...Object.values(state.confessions));
    const guilty = state.players.filter((p) => top > 0 && state.confessions[p] === top);
    return guilty.length
      ? { ...r, summary: `${r.summary} Most guilty tonight: ${guilty.map((p) => nameOf(ctx, p)).join(" & ")} 😈` }
      : r;
  },
  roundSummaries: (state) => state.summaries,
  addPlayer: (state, player) => ({
    ...state,
    players: [...state.players, player],
    scores: { ...state.scores, [player]: 0 },
    confessions: { ...state.confessions, [player]: 0 },
  }),

  publicView(state): NhiePublic {
    return {
      players: state.players,
      round: state.round,
      total: state.prompts.length,
      phase: state.phase,
      prompt: state.prompts[state.round - 1]!,
      answered: state.players.filter((p) => state.answers[p]),
      last: state.phase === "answer" ? null : state.last,
      confessions: state.confessions,
      scores: state.scores,
      log: state.log,
    };
  },
  privateView: (state, player): NhiePrivate => ({ answer: state.answers[player] ?? null }),
};

export interface NhiePublic {
  players: PlayerId[];
  round: number;
  total: number;
  phase: NhieState["phase"];
  prompt: string;
  answered: PlayerId[];
  last: NhieState["last"];
  confessions: Record<PlayerId, number>;
  scores: Record<PlayerId, number>;
  log: string[];
}
export interface NhiePrivate {
  answer: { have: boolean; guess: number } | null;
}
