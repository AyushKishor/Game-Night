import type { Rng } from "./rng";

/**
 * Standard 52-card deck utilities shared by every card game.
 *
 * Cards are serialisable string IDs: rank followed by suit letter,
 * e.g. "AS" (ace of spades), "10H", "QD", "7C".
 */
export const SUITS = ["S", "H", "D", "C"] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
export type Rank = (typeof RANKS)[number];

export type CardId = string;

export const SUIT_NAMES: Record<Suit, string> = {
  S: "Spades",
  H: "Hearts",
  D: "Diamonds",
  C: "Clubs",
};
export const SUIT_SYMBOLS: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
export const RANK_NAMES: Record<Rank, string> = {
  A: "Ace",
  "2": "Two",
  "3": "Three",
  "4": "Four",
  "5": "Five",
  "6": "Six",
  "7": "Seven",
  "8": "Eight",
  "9": "Nine",
  "10": "Ten",
  J: "Jack",
  Q: "Queen",
  K: "King",
};

export function cardId(rank: Rank, suit: Suit): CardId {
  return `${rank}${suit}`;
}

export function isCardId(value: unknown): value is CardId {
  if (typeof value !== "string" || value.length < 2 || value.length > 3) return false;
  const suit = value.slice(-1);
  const rank = value.slice(0, -1);
  return (SUITS as readonly string[]).includes(suit) && (RANKS as readonly string[]).includes(rank);
}

export function suitOf(card: CardId): Suit {
  return card.slice(-1) as Suit;
}

export function rankOf(card: CardId): Rank {
  return card.slice(0, -1) as Rank;
}

export function isRed(card: CardId): boolean {
  const s = suitOf(card);
  return s === "H" || s === "D";
}

export function cardName(card: CardId): string {
  return `${RANK_NAMES[rankOf(card)]} of ${SUIT_NAMES[suitOf(card)]}`;
}

export function cardLabel(card: CardId): string {
  return `${rankOf(card)}${SUIT_SYMBOLS[suitOf(card)]}`;
}

/** Numeric rank value. Aces low (1) by default; `acesHigh` makes them 14. */
export function rankValue(card: CardId | Rank, acesHigh = false): number {
  const rank = (card.length >= 2 && isCardId(card) ? rankOf(card) : card) as Rank;
  const idx = RANKS.indexOf(rank) + 1;
  if (idx === 1 && acesHigh) return 14;
  return idx;
}

/** Compare by rank only. Returns negative, zero or positive. */
export function compareRank(a: CardId, b: CardId, acesHigh = true): number {
  return rankValue(a, acesHigh) - rankValue(b, acesHigh);
}

/** Full 52-card deck in canonical order (suit-major). */
export function createDeck(): CardId[] {
  const deck: CardId[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push(cardId(rank, suit));
  return deck;
}

export function shuffledDeck(rng: Rng, filter?: (c: CardId) => boolean): CardId[] {
  const deck = filter ? createDeck().filter(filter) : createDeck();
  return rng.shuffle(deck);
}

/**
 * Deal `count` cards to each of `players` hands from the top of `deck`.
 * Pass `count = "all"` to deal the whole deck round-robin (uneven hands allowed).
 */
export function deal(
  deck: CardId[],
  players: number,
  count: number | "all",
): { hands: CardId[][]; rest: CardId[] } {
  const hands: CardId[][] = Array.from({ length: players }, () => []);
  const pile = deck.slice();
  if (count === "all") {
    let i = 0;
    while (pile.length) hands[i++ % players]!.push(pile.shift()!);
    return { hands, rest: [] };
  }
  if (count * players > pile.length) throw new Error("Not enough cards to deal");
  for (let round = 0; round < count; round++) {
    for (let p = 0; p < players; p++) hands[p]!.push(pile.shift()!);
  }
  return { hands, rest: pile };
}

/** Draw up to `n` cards from the top of a pile. Returns drawn cards and the remaining pile. */
export function draw(pile: CardId[], n = 1): { drawn: CardId[]; pile: CardId[] } {
  return { drawn: pile.slice(0, n), pile: pile.slice(n) };
}

/**
 * Refill an empty draw pile from a discard pile, keeping the top discard in place.
 */
export function recycleDiscards(
  drawPile: CardId[],
  discard: CardId[],
  rng: Rng,
): { drawPile: CardId[]; discard: CardId[] } {
  if (drawPile.length > 0 || discard.length <= 1) return { drawPile, discard };
  const top = discard[discard.length - 1]!;
  return { drawPile: rng.shuffle(discard.slice(0, -1)), discard: [top] };
}

const SORT_SUIT_ORDER: Record<Suit, number> = { C: 0, D: 1, S: 2, H: 3 };

/** Sort a hand by suit then rank — alternating colours for readability. */
export function sortHand(hand: readonly CardId[], opts: { acesHigh?: boolean; bySuit?: boolean } = {}) {
  const { acesHigh = true, bySuit = true } = opts;
  return hand.slice().sort((a, b) => {
    if (bySuit) {
      const s = SORT_SUIT_ORDER[suitOf(a)] - SORT_SUIT_ORDER[suitOf(b)];
      if (s !== 0) return s;
      return rankValue(a, acesHigh) - rankValue(b, acesHigh);
    }
    const r = rankValue(a, acesHigh) - rankValue(b, acesHigh);
    return r !== 0 ? r : SORT_SUIT_ORDER[suitOf(a)] - SORT_SUIT_ORDER[suitOf(b)];
  });
}

export function removeCards(hand: readonly CardId[], cards: readonly CardId[]): CardId[] {
  const set = new Set(cards);
  return hand.filter((c) => !set.has(c));
}

export function hasAll(hand: readonly CardId[], cards: readonly CardId[]): boolean {
  const set = new Set(hand);
  return cards.every((c) => set.has(c)) && new Set(cards).size === cards.length;
}
