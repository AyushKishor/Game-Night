import { describe, expect, it } from "vitest";
import {
  cardLabel,
  compareRank,
  createDeck,
  deal,
  draw,
  hasAll,
  isCardId,
  rankOf,
  rankValue,
  recycleDiscards,
  shuffledDeck,
  sortHand,
  suitOf,
} from "@/lib/engine/cards";
import { createRng, secureSeed } from "@/lib/engine/rng";

describe("deck", () => {
  it("has 52 unique, valid cards across four suits and thirteen ranks", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck).size).toBe(52);
    expect(deck.every(isCardId)).toBe(true);
    expect(new Set(deck.map(suitOf)).size).toBe(4);
    expect(new Set(deck.map(rankOf)).size).toBe(13);
  });

  it("parses and labels cards", () => {
    expect(rankOf("10H")).toBe("10");
    expect(suitOf("10H")).toBe("H");
    expect(cardLabel("QS")).toBe("Q♠");
    expect(isCardId("1H")).toBe(false);
    expect(isCardId("AX")).toBe(false);
    expect(isCardId("<script>")).toBe(false);
  });
});

describe("shuffling", () => {
  it("is deterministic for a given seed and a permutation of the deck", () => {
    const a = shuffledDeck(createRng("seed-1"));
    const b = shuffledDeck(createRng("seed-1"));
    const c = shuffledDeck(createRng("seed-2"));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a.slice().sort()).toEqual(createDeck().sort());
  });

  it("produces reasonably uniform first cards", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 5200; i++) {
      const first = shuffledDeck(createRng(`s${i}`))[0]!;
      counts.set(first, (counts.get(first) ?? 0) + 1);
    }
    expect(counts.size).toBe(52);
    for (const n of counts.values()) expect(n).toBeGreaterThan(40); // expected 100
  });

  it("creates distinct secure seeds", () => {
    expect(secureSeed()).toMatch(/^[0-9a-f]{32}$/);
    expect(secureSeed()).not.toBe(secureSeed());
  });
});

describe("dealing and drawing", () => {
  it("deals round-robin and returns the rest", () => {
    const deck = createDeck();
    const { hands, rest } = deal(deck, 4, 5);
    expect(hands.map((h) => h.length)).toEqual([5, 5, 5, 5]);
    expect(hands[0]![0]).toBe(deck[0]);
    expect(hands[1]![0]).toBe(deck[1]);
    expect(rest).toHaveLength(32);
  });

  it("deals the whole deck unevenly with 'all'", () => {
    const { hands, rest } = deal(createDeck(), 3, "all");
    expect(hands.map((h) => h.length)).toEqual([18, 17, 17]);
    expect(rest).toHaveLength(0);
  });

  it("refuses to deal more cards than exist", () => {
    expect(() => deal(createDeck(), 8, 7)).toThrow();
  });

  it("draws from the top", () => {
    const { drawn, pile } = draw(["AS", "2S", "3S"], 2);
    expect(drawn).toEqual(["AS", "2S"]);
    expect(pile).toEqual(["3S"]);
  });

  it("recycles discards but keeps the top card", () => {
    const res = recycleDiscards([], ["AS", "2S", "3S"], createRng("x"));
    expect(res.discard).toEqual(["3S"]);
    expect(res.drawPile.sort()).toEqual(["2S", "AS"]);
  });
});

describe("comparison and sorting", () => {
  it("compares ranks with aces high or low", () => {
    expect(compareRank("AS", "KS")).toBeGreaterThan(0);
    expect(compareRank("AS", "KS", false)).toBeLessThan(0);
    expect(rankValue("10D")).toBe(10);
    expect(compareRank("7H", "7C")).toBe(0);
  });

  it("sorts hands by suit then rank", () => {
    expect(sortHand(["KS", "2C", "AS", "3H", "10C"])).toEqual(["2C", "10C", "KS", "AS", "3H"]);
    expect(sortHand(["KS", "2C", "AS"], { bySuit: false })).toEqual(["2C", "KS", "AS"]);
  });

  it("checks card ownership without duplicates", () => {
    expect(hasAll(["AS", "2S"], ["AS"])).toBe(true);
    expect(hasAll(["AS", "2S"], ["AS", "AS"])).toBe(false);
    expect(hasAll(["AS"], ["3S"])).toBe(false);
  });
});
