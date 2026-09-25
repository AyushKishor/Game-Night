import moderation from "@/content/moderation.json";

/**
 * Text sanitisation for every piece of user-supplied text (nicknames,
 * answers, clues, captions). React escapes output, and we never render
 * user text as HTML; this layer additionally normalises whitespace, strips
 * control / zero-width / bidi characters and enforces length limits.
 */
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤﻿]/g;

export function cleanText(input: string, maxLength: number): string {
  return input.normalize("NFKC").replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

const blocked = moderation.blocked.map((w) => w.toLowerCase());
const blockedPatterns = blocked.map(
  (w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i"),
);

/** Normalises common character substitutions (e.g. "sh1t") before matching. */
function deLeet(input: string): string {
  return input
    .toLowerCase()
    .replace(/[0]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4@]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t");
}

export function containsBlockedWord(input: string): boolean {
  const variants = [input.toLowerCase(), deLeet(input)];
  return variants.some((v) => blockedPatterns.some((re) => re.test(v)));
}

export const NICKNAME_MAX = 16;
export const ANSWER_MAX = 40;
export const CAPTION_MAX = 120;
export const CLUE_MAX = 20;

export function sanitizeNickname(input: string): string | null {
  const name = cleanText(input, NICKNAME_MAX);
  if (name.length < 1) return null;
  if (containsBlockedWord(name)) return null;
  return name;
}

/** Normalised form used to compare answers ("The  Apple!" == "apple"). */
export function normalizeAnswer(input: string): string {
  return cleanText(input, 200)
    .toLowerCase()
    .replace(/^(the|a|an)\s+/, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}
