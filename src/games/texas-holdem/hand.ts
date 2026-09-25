import { type CardId, rankValue, suitOf } from "@/lib/engine/cards";

export const HAND_NAMES = [
  "High Card",
  "Pair",
  "Two Pair",
  "Three of a Kind",
  "Straight",
  "Flush",
  "Full House",
  "Four of a Kind",
  "Straight Flush",
] as const;

/** [category, ...tiebreakers] — compare lexicographically. */
export type HandScore = number[];

function score5(cards: CardId[]): HandScore {
  const ranks = cards.map((c) => rankValue(c, true)).sort((a, b) => b - a);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]!));
  const uniq = [...new Set(ranks)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (ranks[0]! - ranks[4]! === 4) straightHigh = ranks[0]!;
    else if (ranks.join() === "14,5,4,3,2") straightHigh = 5;
  }
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const byGroup = groups.map((g) => g[0]);
  if (straightHigh && flush) return [8, straightHigh];
  if (groups[0]![1] === 4) return [7, ...byGroup];
  if (groups[0]![1] === 3 && groups[1]![1] === 2) return [6, ...byGroup];
  if (flush) return [5, ...ranks];
  if (straightHigh) return [4, straightHigh];
  if (groups[0]![1] === 3) return [3, ...byGroup];
  if (groups[0]![1] === 2 && groups[1]![1] === 2) return [2, ...byGroup];
  if (groups[0]![1] === 2) return [1, ...byGroup];
  return [0, ...ranks];
}

export function compareScores(a: HandScore, b: HandScore): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Best 5-card hand out of 5–7 cards. */
export function bestHand(cards: CardId[]): { score: HandScore; cards: CardId[]; name: string } {
  let best: { score: HandScore; cards: CardId[] } | null = null;
  const n = cards.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const five = [cards[a]!, cards[b]!, cards[c]!, cards[d]!, cards[e]!];
            const score = score5(five);
            if (!best || compareScores(score, best.score) > 0) best = { score, cards: five };
          }
  return { ...best!, name: HAND_NAMES[best!.score[0]!]! };
}
