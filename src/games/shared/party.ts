import type { GameConfig, HouseRuleDef, PlayerId, RoundSummary } from "@/lib/engine/types";
import { cleanText, containsBlockedWord } from "@/lib/shared/text";

/** Optional adults-only drinking-game house rule for party games. */
export const SIP_RULE: HouseRuleDef = {
  key: "sips",
  label: "Sip mode (adults only)",
  description: "The screen calls out who takes a sip each round — any drink works. Please drink responsibly.",
  default: false,
};

export function sipsEnabled(config: GameConfig): boolean {
  return Boolean(config.houseRules.sips);
}

export function sippersOf(summary: RoundSummary): PlayerId[] {
  return (
    summary.sips ??
    Object.entries(summary.scores)
      .filter(([, s]) => s <= 0)
      .map(([p]) => p)
  );
}

/**
 * Validates free-text submissions (answers, clues, captions): trims, strips
 * control characters, enforces length and, when the family filter is on,
 * blocks listed words. Returns the clean text or an error message.
 */
export function checkText(raw: string, max: number, config: GameConfig): { text: string } | { error: string } {
  const text = cleanText(raw, max + 1);
  if (!text) return { error: "Type something first." };
  if (text.length > max) return { error: `Keep it under ${max} characters.` };
  if (config.familyFriendly && containsBlockedWord(text))
    return { error: "Let's keep it family-friendly — try different words." };
  return { text };
}

/** Deterministic pick of `n` distinct indices from a content list. */
export function pickIndices(total: number, n: number, rng: { shuffle<T>(a: readonly T[]): T[] }): number[] {
  const all = Array.from({ length: total }, (_, i) => i);
  const out: number[] = [];
  while (out.length < n) out.push(...rng.shuffle(all).slice(0, n - out.length));
  return out;
}

/** Seat-alternating teams: 0, 1, 0, 1 … */
export function teamsFor(players: PlayerId[], teamMode: boolean): Record<PlayerId, number> {
  return Object.fromEntries(players.map((p, i) => [p, teamMode ? i % 2 : i]));
}

export const TEAM_NAMES = ["Team Coral", "Team Sky", "Team Mint", "Team Amber"];
