import { z } from "zod";
import { deadlineFrom, nameOf, pushLog, resultsFromScores, zeroScores } from "@/lib/engine/helpers";
import type {
  GameContext,
  GameMeta,
  GameModule,
  HouseRuleDef,
  PlayerId,
  PresetId,
  GameConfig,
  RoundSummary,
} from "@/lib/engine/types";
import { SIP_RULE, TEAM_NAMES, teamsFor } from "./party";

/**
 * Shared multiple-choice quiz engine (Trivia Night, Emoji Movies).
 * Everyone answers at the same time; faster correct answers earn more.
 * In team mode, teammates' points are pooled.
 */
export interface QuizQuestion {
  prompt: string;
  /** Optional big display line, e.g. an emoji clue. */
  display?: string;
  category: string;
  choices: string[];
  answer: number;
}

export interface QuizState {
  players: PlayerId[];
  teamOf: Record<PlayerId, number>;
  teamMode: boolean;
  questions: QuizQuestion[];
  index: number;
  phase: "question" | "reveal" | "over";
  answers: Record<PlayerId, { choice: number; at: number }>;
  askedAt: number;
  points: Record<PlayerId, number>;
  /** Consecutive correct answers. */
  streaks: Record<PlayerId, number>;
  summaries: RoundSummary[];
  deadline: number | null;
  log: string[];
}

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("answer"), choice: z.number().int().min(0).max(5) }),
  z.object({ type: z.literal("next") }),
]);
type Action = z.infer<typeof actionSchema>;

export function quizScores(state: QuizState): Record<PlayerId, number> {
  if (!state.teamMode) return state.points;
  const team: Record<number, number> = {};
  for (const p of state.players) team[state.teamOf[p]!] = (team[state.teamOf[p]!] ?? 0) + state.points[p]!;
  return Object.fromEntries(state.players.map((p) => [p, team[state.teamOf[p]!]!]));
}

export function createQuizGame(
  meta: GameMeta,
  build: (ctx: GameContext, count: number) => QuizQuestion[],
  presets: Record<PresetId, Partial<GameConfig>>,
  extraHouseRules: HouseRuleDef[] = [],
): GameModule<QuizState, Action> {
  const reveal = (state: QuizState, ctx: GameContext): QuizState => {
    const q = state.questions[state.index]!;
    const window = Math.max(1, (state.deadline ?? ctx.now) - state.askedAt);
    const gained: Record<PlayerId, number> = {};
    const streaks: Record<PlayerId, number> = {};
    for (const p of state.players) {
      const a = state.answers[p];
      if (a && a.choice === q.answer) {
        const speed = Math.max(0, 1 - (a.at - state.askedAt) / window);
        streaks[p] = (state.streaks[p] ?? 0) + 1;
        const streakBonus = Math.min(streaks[p]! - 1, 3) * 2;
        gained[p] = 10 + Math.round(speed * 5) + streakBonus;
      } else {
        gained[p] = 0;
        streaks[p] = 0;
      }
    }
    const correct = state.players.filter((p) => gained[p]! > 0);
    const fastest = correct.slice().sort((a, b) => state.answers[a]!.at - state.answers[b]!.at)[0];
    const points = Object.fromEntries(state.players.map((p) => [p, state.points[p]! + gained[p]!]));
    const hot = state.players.filter((p) => streaks[p]! >= 3);
    const summary: RoundSummary = {
      round: state.index + 1,
      title: `Answer: ${q.choices[q.answer]}`,
      lines: [
        correct.length ? `${correct.length} of ${state.players.length} got it right` : "Nobody got it! 😬",
        ...(fastest ? [`⚡ Fastest finger: ${nameOf(ctx, fastest)}`] : []),
        ...hot.map((p) => `🔥 ${nameOf(ctx, p)} is on a ${streaks[p]}-answer streak`),
      ],
      scores: gained,
    };
    return {
      ...state,
      phase: "reveal",
      points,
      streaks,
      summaries: [...state.summaries, summary],
      deadline: ctx.now + 10_000,
      log: pushLog(state.log, summary.title),
    };
  };

  const nextQuestion = (state: QuizState, ctx: GameContext): QuizState => {
    if (state.index + 1 >= state.questions.length) return { ...state, phase: "over", deadline: null };
    return {
      ...state,
      index: state.index + 1,
      phase: "question",
      answers: {},
      askedAt: ctx.now,
      deadline: deadlineFrom(ctx.now, ctx.config.roundSeconds || 20),
    };
  };

  const game: GameModule<QuizState, Action> = {
    meta,
    settings: ["rounds", "roundSeconds", "difficulty", "teamMode", "allowJoinInProgress"],
    houseRules: [...extraHouseRules, SIP_RULE],
    presets,
    actionSchema,

    setup(players, ctx) {
      const teamMode = ctx.config.teamMode && players.length >= 2;
      return {
        players,
        teamOf: teamsFor(players, teamMode),
        teamMode,
        questions: build(ctx, ctx.config.rounds),
        index: 0,
        phase: "question",
        answers: {},
        askedAt: ctx.now,
        points: zeroScores(players),
        streaks: zeroScores(players),
        summaries: [],
        deadline: deadlineFrom(ctx.now, ctx.config.roundSeconds || 20),
        log: [teamMode ? "Teams are set — answers are pooled!" : "Get ready!"],
      };
    },

    validate(state, player, action, ctx) {
      if (action.type === "next") {
        if (state.phase !== "reveal") return "Nothing to continue.";
        return player === ctx.hostId ? null : "Only the host can continue.";
      }
      if (state.phase !== "question") return "Wait for the next question.";
      if (state.answers[player]) return "You've already answered.";
      if (action.choice >= state.questions[state.index]!.choices.length) return "Pick one of the answers.";
      return null;
    },

    apply(state, player, action, ctx) {
      if (action.type === "next") return nextQuestion(state, ctx);
      const answers = { ...state.answers, [player]: { choice: action.choice, at: ctx.now } };
      const s = { ...state, answers };
      return state.players.every((p) => answers[p]) ? reveal(s, ctx) : s;
    },

    pending: (state) => (state.phase === "question" ? state.players.filter((p) => !state.answers[p]) : []),
    deadline: (state) => (state.phase === "over" ? null : state.deadline),
    onTimeout: (state, ctx) => (state.phase === "question" ? reveal(state, ctx) : nextQuestion(state, ctx)),
    botAction(state, player, ctx) {
      if (state.phase !== "question" || state.answers[player]) return null;
      const q = state.questions[state.index]!;
      const skill = { easy: 0.35, normal: 0.55, hard: 0.75 }[ctx.config.difficulty];
      return { type: "answer", choice: ctx.rng.next() < skill ? q.answer : ctx.rng.int(q.choices.length) };
    },

    isOver: (state) => state.phase === "over",
    results: (state, ctx) => resultsFromScores(quizScores(state), ctx, { order: state.players }),
    roundSummaries: (state) => state.summaries,
    addPlayer(state, player) {
      const players = [...state.players, player];
      const counts = [0, 1].map((t) => state.players.filter((p) => state.teamOf[p] === t).length);
      const team = state.teamMode ? (counts[0]! <= counts[1]! ? 0 : 1) : players.length - 1;
      return {
        ...state,
        players,
        teamOf: { ...state.teamOf, [player]: team },
        points: { ...state.points, [player]: 0 },
        streaks: { ...state.streaks, [player]: 0 },
      };
    },

    publicView(state): QuizPublic {
      const q = state.questions[state.index]!;
      return {
        players: state.players,
        teamOf: state.teamOf,
        teamMode: state.teamMode,
        teamNames: TEAM_NAMES.slice(0, 2),
        number: state.index + 1,
        total: state.questions.length,
        phase: state.phase,
        prompt: q.prompt,
        display: q.display ?? null,
        category: q.category,
        choices: q.choices,
        answer: state.phase === "question" ? null : q.answer,
        answered: state.players.filter((p) => state.answers[p]),
        picks:
          state.phase === "question" ? null : Object.fromEntries(Object.entries(state.answers).map(([p, a]) => [p, a.choice])),
        scores: quizScores(state),
        streaks: state.streaks,
        log: state.log,
      };
    },
    privateView: (state, player) => ({
      choice: state.phase === "question" ? (state.answers[player]?.choice ?? null) : (state.answers[player]?.choice ?? null),
    }),
  };
  return game;
}

export interface QuizPublic {
  players: PlayerId[];
  teamOf: Record<PlayerId, number>;
  teamMode: boolean;
  teamNames: string[];
  number: number;
  total: number;
  phase: QuizState["phase"];
  prompt: string;
  display: string | null;
  category: string;
  choices: string[];
  answer: number | null;
  answered: PlayerId[];
  picks: Record<PlayerId, number> | null;
  scores: Record<PlayerId, number>;
  streaks: Record<PlayerId, number>;
  log: string[];
}
export interface QuizPrivate {
  choice: number | null;
}
