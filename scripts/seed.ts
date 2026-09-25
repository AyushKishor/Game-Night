/**
 * Game Night needs no seed rows: party-game content ships as versioned JSON in
 * src/content and is validated at startup. This script validates the content
 * and reports counts, so `npm run db:seed` is a safe no-op in any environment.
 */
import { content } from "../src/content";

const counts = {
  "Quick Categories prompts": content.quickCategories.categories.length,
  "Majority Rules questions": content.majorityRules.questions.length,
  "Rank It prompt sets": content.rankIt.sets.length,
  "Caption Clash scenarios": content.captionClash.scenarios.length,
  "Trivia questions": content.trivia.questions.length,
  "Emoji Movies puzzles": content.emojiMovies.puzzles.length,
  "Most Likely To prompts": content.mostLikely.classic.length + content.mostLikely.spicy.length,
  "Clue Rush cards": content.clueRush.cards.length,
  "Secret Signal symbols": content.secretSignal.symbols.length,
};
for (const [k, v] of Object.entries(counts)) console.log(`${k.padEnd(28)} ${v}`);
console.log("Content is valid. No database seed required.");
