import { z } from "zod";
import quickCategoriesRaw from "./quick-categories.json";
import majorityRulesRaw from "./majority-rules.json";
import rankItRaw from "./rank-it.json";
import captionClashRaw from "./caption-clash.json";
import secretSignalRaw from "./secret-signal.json";

/**
 * Party-game content lives in versioned JSON files so it can be reviewed,
 * translated and extended without touching game logic or UI code.
 * Every file is validated at load time.
 */
const quickCategoriesSchema = z.object({
  letters: z.array(z.string().length(1)).min(5),
  categories: z.array(z.string().min(2).max(60)).min(100),
});
const majorityRulesSchema = z.object({
  questions: z
    .array(z.object({ q: z.string().min(3), a: z.string().min(1), b: z.string().min(1) }))
    .min(100),
});
const rankItSchema = z.object({
  sets: z.array(z.object({ prompt: z.string().min(3), items: z.array(z.string().min(1)).length(5) })).min(100),
});
const captionClashSchema = z.object({ scenarios: z.array(z.string().min(10)).min(100) });
const secretSignalSchema = z.object({ symbols: z.array(z.string().min(2)).min(12) });

export const content = {
  quickCategories: quickCategoriesSchema.parse(quickCategoriesRaw),
  majorityRules: majorityRulesSchema.parse(majorityRulesRaw),
  rankIt: rankItSchema.parse(rankItRaw),
  captionClash: captionClashSchema.parse(captionClashRaw),
  secretSignal: secretSignalSchema.parse(secretSignalRaw),
};

export type ContentLibrary = typeof content;
