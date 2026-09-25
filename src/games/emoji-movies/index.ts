import { createQuizGame, type QuizQuestion } from "../shared/quiz";

export const emojiMovies = createQuizGame(
  {
    id: "emoji-movies",
    name: "Emoji Movies",
    tagline: "Guess the film or phrase from a string of emoji.",
    category: "party",
    minPlayers: 1,
    maxPlayers: 12,
    duration: "10–15 min",
    icon: "Radio",
    accent: "violet",
    supportsBots: true,
    supportsJoinInProgress: true,
    rules: {
      goal: "Decode the emoji before everyone else.",
      steps: [
        "A row of emoji appears on the big screen — it spells out a film title or a common phrase.",
        "Pick the right answer from four options on your phone.",
        "Right answers score 10 plus a speed bonus.",
        "Play solo or turn on team mode to pool points.",
        "Difficulty: Easy is films only, Hard mixes in phrases.",
      ],
      scoring: "10 points per correct answer plus a speed bonus of up to 5.",
      ending: "Most points after the last puzzle wins; ties share the win.",
    },
  },
  (ctx, count) => {
    const all = ctx.content.emojiMovies.puzzles;
    const pool = ctx.config.difficulty === "easy" ? all.filter((p) => p.cat === "Movie") : all;
    return ctx.rng
      .shuffle(pool)
      .slice(0, count)
      .map((p): QuizQuestion => {
        const same = all.filter((x) => x.cat === p.cat && x.a !== p.a);
        const choices = ctx.rng.shuffle([p.a, ...ctx.rng.shuffle(same).slice(0, 3).map((x) => x.a)]);
        return {
          prompt: p.cat === "Movie" ? "Which film is this?" : "Which phrase is this?",
          display: p.e,
          category: p.cat,
          choices,
          answer: choices.indexOf(p.a),
        };
      });
  },
  {
    quick: { rounds: 6, roundSeconds: 15, difficulty: "easy", allowJoinInProgress: true },
    standard: { rounds: 12, roundSeconds: 20, difficulty: "normal", allowJoinInProgress: true },
    long: { rounds: 20, roundSeconds: 25, difficulty: "hard", allowJoinInProgress: true },
  },
);
