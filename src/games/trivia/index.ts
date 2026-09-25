import { SPICY_RULE } from "../shared/party";
import { createQuizGame, type QuizQuestion } from "../shared/quiz";

export const trivia = createQuizGame(
  {
    id: "trivia",
    name: "Trivia Night",
    tagline: "Quick-fire multiple choice. Fast and right wins.",
    category: "party",
    minPlayers: 1,
    maxPlayers: 12,
    duration: "10–20 min",
    icon: "ListOrdered",
    accent: "sky",
    supportsBots: true,
    supportsJoinInProgress: true,
    rules: {
      goal: "Answer the most questions correctly — quickly.",
      steps: [
        "A question and four answers appear on the big screen.",
        "Everyone picks an answer on their own phone before time runs out.",
        "Correct answers score 10, plus up to 5 bonus points for speed.",
        "Team mode splits the room into two teams whose points are pooled.",
        "Difficulty chooses easier or harder questions. Spicy mode (on by default) mixes in an After Dark pack about drinks, dating and nights out.",
      ],
      scoring: "10 points per correct answer, up to 5 more for speed, and up to 6 more for answer streaks 🔥.",
      ending: "Most points after the last question wins (in team mode, the whole team shares the result); ties share the win.",
    },
  },
  (ctx, count) => {
    const allowed = { easy: [1, 2], normal: [1, 2, 3], hard: [2, 3] }[ctx.config.difficulty];
    const general = ctx.rng.shuffle(ctx.content.trivia.questions.filter((q) => allowed.includes(q.d)));
    const spicy = ctx.rng.shuffle(ctx.content.triviaAfterDark.questions.filter((q) => allowed.includes(q.d)));
    // Spicy on: about three quarters After Dark questions, the rest general knowledge.
    const nSpicy = (ctx.config.houseRules.spicy ?? true) ? Math.min(spicy.length, Math.ceil((count * 3) / 4)) : 0;
    const picked = ctx.rng.shuffle([...spicy.slice(0, nSpicy), ...general.slice(0, count - nSpicy)]);
    return picked.map((q): QuizQuestion => {
      const choices = ctx.rng.shuffle([q.a, ...q.w]);
      return { prompt: q.q, category: q.cat, choices, answer: choices.indexOf(q.a) };
    });
  },
  {
    quick: { rounds: 6, roundSeconds: 15, teamMode: false, allowJoinInProgress: true },
    standard: { rounds: 12, roundSeconds: 20, teamMode: false, allowJoinInProgress: true },
    long: { rounds: 25, roundSeconds: 25, teamMode: false, allowJoinInProgress: true },
  },
  [SPICY_RULE],
);
