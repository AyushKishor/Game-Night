import { z } from "zod";
import { REVEAL_SECONDS, deadlineFrom, nameOf, pushLog, resultsFromScores, zeroScores } from "@/lib/engine/helpers";
import type { GameContext, GameModule, PlayerId, RoundSummary } from "@/lib/engine/types";
import { ANSWER_MAX, normalizeAnswer } from "@/lib/shared/text";
import { SIP_RULE, checkText, pickIndices } from "../shared/party";
import { playerIdSchema } from "../shared/schemas";

export interface QuickCatState {
  players: PlayerId[];
  categories: number[];
  letters: string[];
  round: number;
  phase: "answer" | "review" | "reveal" | "over";
  answers: Record<PlayerId, string>;
  /** flagger -> authors whose answers they reject */
  flags: Record<PlayerId, PlayerId[]>;
  done: PlayerId[];
  scores: Record<PlayerId, number>;
  last: { answers: Record<PlayerId, string>; valid: Record<PlayerId, boolean>; gained: Record<PlayerId, number> } | null;
  summaries: RoundSummary[];
  deadline: number | null;
  log: string[];
}

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("answer"), text: z.string().max(80) }),
  z.object({ type: z.literal("skip") }),
  z.object({ type: z.literal("flag"), author: playerIdSchema, flagged: z.boolean() }),
  z.object({ type: z.literal("done") }),
  z.object({ type: z.literal("next") }),
]);
type Action = z.infer<typeof actionSchema>;

function startsWithLetter(text: string, letter: string) {
  const t = text.trim().replace(/^(the|a|an)\s+/i, "");
  return t.toUpperCase().startsWith(letter);
}

function score(state: QuickCatState, ctx: GameContext): QuickCatState {
  const valid: Record<PlayerId, boolean> = {};
  const counts = new Map<string, number>();
  for (const p of state.players) {
    const a = state.answers[p];
    if (!a) {
      valid[p] = false;
      continue;
    }
    const flaggers = state.players.filter((f) => f !== p && (state.flags[f] ?? []).includes(p)).length;
    valid[p] = flaggers * 2 <= state.players.length - 1;
    if (valid[p]) counts.set(normalizeAnswer(a), (counts.get(normalizeAnswer(a)) ?? 0) + 1);
  }
  const gained = Object.fromEntries(
    state.players.map((p) => [p, valid[p] ? ((counts.get(normalizeAnswer(state.answers[p]!)) ?? 0) > 1 ? 1 : 2) : 0]),
  );
  const scores = Object.fromEntries(state.players.map((p) => [p, state.scores[p]! + gained[p]!]));
  const cat = ctx.content.quickCategories.categories[state.categories[state.round - 1]!]!;
  const summary: RoundSummary = {
    round: state.round,
    title: `${cat} — ${state.letters[state.round - 1]}`,
    lines: state.players.map((p) => `${nameOf(ctx, p)}: ${state.answers[p] ?? "—"} ${valid[p] ? `(+${gained[p]})` : "(no points)"}`),
    scores: gained,
  };
  return {
    ...state,
    phase: "reveal",
    scores,
    last: { answers: state.answers, valid, gained },
    summaries: [...state.summaries, summary],
    deadline: deadlineFrom(ctx.now, REVEAL_SECONDS),
    log: pushLog(state.log, `Round ${state.round} scored.`),
  };
}

const toReview = (state: QuickCatState, ctx: GameContext): QuickCatState =>
  Object.keys(state.answers).length === 0
    ? score(state, ctx)
    : { ...state, phase: "review", flags: {}, done: [], deadline: deadlineFrom(ctx.now, Math.max(20, Math.round(ctx.config.roundSeconds / 2))) };

function next(state: QuickCatState, ctx: GameContext): QuickCatState {
  if (state.round >= state.categories.length) return { ...state, phase: "over", deadline: null };
  return { ...state, round: state.round + 1, phase: "answer", answers: {}, flags: {}, done: [], deadline: deadlineFrom(ctx.now, ctx.config.roundSeconds) };
}

export const quickCategories: GameModule<QuickCatState, Action> = {
  meta: {
    id: "quick-categories",
    name: "Quick Categories",
    tagline: "A category, a letter, a ticking clock.",
    category: "party",
    minPlayers: 2,
    maxPlayers: 12,
    duration: "10–15 min",
    icon: "Timer",
    accent: "mint",
    supportsBots: true,
    supportsJoinInProgress: true,
    rules: {
      goal: "Come up with answers nobody else thinks of.",
      steps: [
        "A category and a starting letter appear — e.g. “Fruits” and “B”.",
        "Type one answer that fits and starts with the letter before time runs out.",
        "Then everyone reviews the answers. Tap any you think don't fit.",
        "An answer rejected by more than half of the other players scores nothing.",
      ],
      scoring: "A valid answer nobody else gave: 2 points. A valid answer someone else also gave: 1 point.",
      ending: "Most points after the set number of rounds wins; ties share the win.",
    },
  },
  settings: ["rounds", "roundSeconds", "familyFriendly", "allowJoinInProgress"],
  houseRules: [SIP_RULE],
  presets: {
    quick: { rounds: 4, roundSeconds: 30, allowJoinInProgress: true },
    standard: { rounds: 8, roundSeconds: 45, allowJoinInProgress: true },
    long: { rounds: 12, roundSeconds: 60, allowJoinInProgress: true },
  },
  actionSchema,

  setup(players, ctx) {
    const qc = ctx.content.quickCategories;
    const categories = pickIndices(qc.categories.length, ctx.config.rounds, ctx.rng);
    return {
      players,
      categories,
      letters: categories.map(() => ctx.rng.pick(qc.letters)),
      round: 1,
      phase: "answer",
      answers: {},
      flags: {},
      done: [],
      scores: zeroScores(players),
      last: null,
      summaries: [],
      deadline: deadlineFrom(ctx.now, ctx.config.roundSeconds),
      log: [],
    };
  },

  validate(state, player, action, ctx) {
    switch (action.type) {
      case "next":
        if (state.phase !== "reveal") return "Nothing to continue.";
        return player === ctx.hostId ? null : "Only the host can continue.";
      case "answer": {
        if (state.phase !== "answer") return "Answers are locked.";
        if (state.answers[player]) return "You've already answered.";
        const res = checkText(action.text, ANSWER_MAX, ctx.config);
        if ("error" in res) return res.error;
        const letter = state.letters[state.round - 1]!;
        if (!startsWithLetter(res.text, letter)) return `Your answer must start with “${letter}”.`;
        return null;
      }
      case "skip":
        return state.phase === "answer" && !state.answers[player] ? null : "You can't skip now.";
      case "flag":
        if (state.phase !== "review") return "It's not review time.";
        if (action.author === player) return "You can't flag your own answer.";
        if (!state.answers[action.author]) return "That player didn't answer.";
        return state.done.includes(player) ? "You've already finished reviewing." : null;
      case "done":
        if (state.phase !== "review") return "It's not review time.";
        return state.done.includes(player) ? "You're already done." : null;
    }
  },

  apply(state, player, action, ctx) {
    switch (action.type) {
      case "next":
        return next(state, ctx);
      case "answer": {
        const text = (checkText(action.text, ANSWER_MAX, ctx.config) as { text: string }).text;
        const s = { ...state, answers: { ...state.answers, [player]: text } };
        return state.players.every((p) => s.answers[p] !== undefined) ? toReview(s, ctx) : s;
      }
      case "skip": {
        const s = { ...state, answers: { ...state.answers, [player]: "" } };
        const clean = Object.fromEntries(Object.entries(s.answers).filter(([, a]) => a));
        return state.players.every((p) => s.answers[p] !== undefined) ? toReview({ ...s, answers: clean }, ctx) : s;
      }
      case "flag": {
        const mine = new Set(state.flags[player] ?? []);
        if (action.flagged) mine.add(action.author);
        else mine.delete(action.author);
        return { ...state, flags: { ...state.flags, [player]: [...mine] } };
      }
      case "done": {
        const s = { ...state, done: [...state.done, player] };
        return state.players.every((p) => s.done.includes(p)) ? score(s, ctx) : s;
      }
    }
  },

  pending(state) {
    if (state.phase === "answer") return state.players.filter((p) => state.answers[p] === undefined);
    if (state.phase === "review") return state.players.filter((p) => !state.done.includes(p));
    return [];
  },
  deadline: (state) => (state.phase === "over" ? null : state.deadline),
  onTimeout(state, ctx) {
    if (state.phase === "answer") {
      const clean = Object.fromEntries(Object.entries(state.answers).filter(([, a]) => a));
      return toReview({ ...state, answers: clean }, ctx);
    }
    if (state.phase === "review") return score(state, ctx);
    return next(state, ctx);
  },
  botAction(state, player) {
    if (state.phase === "answer" && state.answers[player] === undefined) return { type: "skip" };
    if (state.phase === "review" && !state.done.includes(player)) return { type: "done" };
    return null;
  },
  isOver: (state) => state.phase === "over",
  results: (state, ctx) => resultsFromScores(state.scores, ctx, { order: state.players }),
  roundSummaries: (state) => state.summaries,
  addPlayer: (state, player) => ({ ...state, players: [...state.players, player], scores: { ...state.scores, [player]: 0 } }),

  publicView(state, ctx): QuickCatPublic {
    return {
      players: state.players,
      round: state.round,
      total: state.categories.length,
      phase: state.phase,
      category: ctx.content.quickCategories.categories[state.categories[state.round - 1]!]!,
      letter: state.letters[state.round - 1]!,
      submitted: state.players.filter((p) => state.answers[p] !== undefined),
      answers: state.phase === "answer" ? null : Object.fromEntries(Object.entries(state.answers).filter(([, a]) => a)),
      flagCounts:
        state.phase === "answer"
          ? null
          : Object.fromEntries(state.players.map((a) => [a, state.players.filter((f) => (state.flags[f] ?? []).includes(a)).length])),
      done: state.done,
      last: state.phase === "reveal" || state.phase === "over" ? state.last : null,
      scores: state.scores,
      log: state.log,
    };
  },
  privateView: (state, player): QuickCatPrivate => ({ answer: state.answers[player] ?? null, flagged: state.flags[player] ?? [] }),
};

export interface QuickCatPublic {
  players: PlayerId[];
  round: number;
  total: number;
  phase: QuickCatState["phase"];
  category: string;
  letter: string;
  submitted: PlayerId[];
  answers: Record<PlayerId, string> | null;
  flagCounts: Record<PlayerId, number> | null;
  done: PlayerId[];
  last: QuickCatState["last"];
  scores: Record<PlayerId, number>;
  log: string[];
}
export interface QuickCatPrivate {
  answer: string | null;
  flagged: PlayerId[];
}
