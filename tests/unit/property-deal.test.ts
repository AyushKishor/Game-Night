import { describe, expect, it } from "vitest";
import { DECK, type PropertyDealState, card, propertyDeal } from "@/games/property-deal";
import { type GameEnvelope, viewCtx } from "@/lib/engine/runner";
import { act, makeEnv, simulate, start } from "./sim";

const find = (pred: (c: (typeof DECK)[number]) => boolean, skip = 0) => DECK.filter(pred)[skip]!.id;
const prop = (color: string, i = 0) => find((c) => c.kind === "property" && c.color === color, i);
const action = (a: string, i = 0) => find((c) => c.kind === "action" && c.action === a, i);
const cash = (v: number, i = 0) => find((c) => c.kind === "money" && c.value === v, i);

/** Start a 3-player game and hand-set the table so rules can be tested precisely. */
function table(patch: (s: PropertyDealState) => void) {
  const { players, env, envelope } = start(propertyDeal, 3, {}, "pd-rules");
  const s = structuredClone(envelope.state as PropertyDealState);
  const all = new Set<string>();
  for (const p of players) {
    s.hands[p] = [];
    s.banks[p] = [];
    s.props[p] = [];
  }
  s.deck = DECK.map((c) => c.id);
  s.discard = [];
  patch(s);
  for (const p of players) {
    for (const c of [...s.hands[p]!, ...s.banks[p]!, ...s.props[p]!.flatMap((x) => [...x.cards, x.house, x.hotel])]) {
      if (c) all.add(c);
    }
  }
  s.deck = s.deck.filter((c) => !all.has(c));
  return { players, env: makeEnv(players, env.now, []), envelope: { ...envelope, state: s } as GameEnvelope };
}

const env = makeEnv(["p1", "p2", "p3"], 1_000_000, []);
const state = (e: { state: unknown }) => e.state as PropertyDealState;

describe("Property Deal", () => {
  it("has the full 106-card deck", () => {
    expect(DECK).toHaveLength(106);
    expect(DECK.filter((c) => c.kind === "money")).toHaveLength(20);
    expect(DECK.filter((c) => c.kind === "action")).toHaveLength(34);
    expect(DECK.filter((c) => c.kind === "rent")).toHaveLength(13);
    expect(DECK.filter((c) => c.kind === "property")).toHaveLength(28);
    expect(DECK.filter((c) => c.kind === "wild")).toHaveLength(11);
  });

  it("deals 5, draws 2 and never shows hands to anyone else", () => {
    simulate(
      propertyDeal,
      4,
      {},
      {
        seed: "pd-privacy",
        onStep: (e) => {
          const s = state(e);
          const ctx = viewCtx(e, makeEnv(e.players));
          const pub = JSON.stringify(propertyDeal.publicView(s, ctx));
          for (const p of e.players) {
            for (const c of s.hands[p]!) {
              expect(pub).not.toContain(`"${c}"`);
              for (const o of e.players) {
                if (o !== p) expect(JSON.stringify(propertyDeal.privateView(s, o, ctx))).not.toContain(`"${c}"`);
              }
            }
          }
          const all = [
            ...s.deck,
            ...s.discard,
            ...Object.values(s.hands).flat(),
            ...Object.values(s.banks).flat(),
            ...Object.values(s.props)
              .flat()
              .flatMap((x) => [...x.cards, x.house, x.hotel].filter(Boolean)),
          ];
          expect(new Set(all).size).toBe(106);
          expect(all).toHaveLength(106);
        },
      },
    );
    const { envelope } = start(propertyDeal, 3);
    const s = state(envelope);
    expect(s.hands.p1).toHaveLength(7);
    expect(s.hands.p2).toHaveLength(5);
  });

  it("charges rent, takes payment without change and moves properties to the collector", () => {
    const rent = find((c) => c.kind === "rent" && c.colors.includes("red") && !c.any);
    let { envelope } = table((s) => {
      s.hands.p1 = [rent];
      s.props.p1 = [{ color: "red", cards: [prop("red"), prop("red", 1)], house: null, hotel: null }];
      s.banks.p2 = [cash(5)];
      s.props.p3 = [{ color: "brown", cards: [prop("brown")], house: null, hotel: null }];
      s.banks.p3 = [cash(1)];
    });
    envelope = act(propertyDeal, envelope, "p1", { type: "rent", card: rent, color: "red" }, env);
    expect(state(envelope).request!.targets.map((t) => t.amount)).toEqual([3, 3]);
    expect(propertyDeal.pending(state(envelope)).sort()).toEqual(["p2", "p3"]);
    // Can't underpay while holding more.
    expect(propertyDeal.validate(state(envelope), "p3", { type: "pay", cards: [cash(1)] }, viewCtx(envelope, env))).toMatch(
      /only/,
    );
    envelope = act(propertyDeal, envelope, "p2", { type: "pay", cards: [cash(5)] }, env);
    envelope = act(propertyDeal, envelope, "p3", { type: "pay", cards: [cash(1), prop("brown")] }, env);
    const s = state(envelope);
    expect(s.request).toBeNull();
    expect(s.banks.p1!.sort()).toEqual([cash(5), cash(1)].sort());
    expect(s.props.p1!.find((p) => p.color === "brown")!.cards).toEqual([prop("brown")]);
    expect(s.props.p3).toEqual([]);
    expect(s.playsLeft).toBe(2);
  });

  it("resolves a Just Say No chain", () => {
    const debt = action("debtCollector");
    const [no1, no2, no3] = [action("justSayNo"), action("justSayNo", 1), action("justSayNo", 2)];
    let { envelope } = table((s) => {
      s.hands.p1 = [debt, no2];
      s.hands.p2 = [no1, no3];
      s.banks.p2 = [cash(5)];
    });
    envelope = act(propertyDeal, envelope, "p1", { type: "debt-collector", card: debt, target: "p2" }, env);
    envelope = act(propertyDeal, envelope, "p2", { type: "just-say-no", card: no1 }, env);
    expect(propertyDeal.pending(state(envelope))).toEqual(["p1"]);
    envelope = act(propertyDeal, envelope, "p1", { type: "just-say-no", card: no2, target: "p2" }, env);
    expect(propertyDeal.pending(state(envelope))).toEqual(["p2"]);
    envelope = act(propertyDeal, envelope, "p2", { type: "just-say-no", card: no3 }, env);
    envelope = act(propertyDeal, envelope, "p1", { type: "accept", target: "p2" }, env);
    const s = state(envelope);
    expect(s.request).toBeNull();
    expect(s.banks.p2).toEqual([cash(5)]);
    expect(s.discard).toEqual(expect.arrayContaining([debt, no1, no2, no3]));
  });

  it("Sly Deal can't touch full sets; Deal Breaker takes the set with its house and can win", () => {
    const sly = action("slyDeal");
    const breaker = action("dealBreaker");
    const house = action("house");
    let { envelope } = table((s) => {
      s.hands.p1 = [sly, breaker];
      s.props.p1 = [
        { color: "brown", cards: [prop("brown"), prop("brown", 1)], house: null, hotel: null },
        { color: "darkBlue", cards: [prop("darkBlue"), prop("darkBlue", 1)], house: null, hotel: null },
      ];
      s.props.p2 = [
        { color: "green", cards: [prop("green"), prop("green", 1), prop("green", 2)], house, hotel: null },
        { color: "pink", cards: [prop("pink")], house: null, hotel: null },
      ];
    });
    const ctx = viewCtx(envelope, env);
    expect(
      propertyDeal.validate(state(envelope), "p1", { type: "sly-deal", card: sly, target: "p2", take: prop("green") }, ctx),
    ).toMatch(/full set/);
    envelope = act(propertyDeal, envelope, "p1", { type: "deal-breaker", card: breaker, target: "p2", color: "green" }, env);
    envelope = act(propertyDeal, envelope, "p2", { type: "accept" }, env);
    const s = state(envelope);
    expect(s.props.p1!.find((p) => p.color === "green")).toMatchObject({ house });
    expect(s.props.p2!.map((p) => p.color)).toEqual(["pink"]);
    expect(s.over).toBe(true);
    expect(s.winner).toBe("p1");
    const results = propertyDeal.results(s, ctx);
    expect(results.standings[0]).toMatchObject({ playerId: "p1", place: 1 });
  });

  it("drops buildings to the bank when a set is broken and enforces the hand limit", () => {
    const debt = action("debtCollector");
    const house = action("house");
    let { envelope } = table((s) => {
      s.hands.p1 = [debt];
      s.props.p2 = [{ color: "brown", cards: [prop("brown"), prop("brown", 1)], house, hotel: null }];
      s.banks.p2 = [cash(4)];
    });
    envelope = act(propertyDeal, envelope, "p1", { type: "debt-collector", card: debt, target: "p2" }, env);
    envelope = act(propertyDeal, envelope, "p2", { type: "pay", cards: [prop("brown"), cash(4)] }, env);
    expect(state(envelope).banks.p2).toEqual([house]);
    expect(state(envelope).props.p2![0]).toMatchObject({ house: null, cards: [prop("brown", 1)] });
    expect(card(house).value).toBe(3);

    const hand = DECK.filter((c) => c.kind === "money")
      .slice(0, 9)
      .map((c) => c.id);
    ({ envelope } = table((s) => (s.hands.p1 = hand)));
    const ctx = viewCtx(envelope, env);
    expect(propertyDeal.validate(state(envelope), "p1", { type: "end-turn" }, ctx)).toMatch(/Discard 2/);
    envelope = act(propertyDeal, envelope, "p1", { type: "end-turn", discard: hand.slice(0, 2) }, env);
    expect(state(envelope).turn).toBe("p2");
    expect(state(envelope).hands.p2).toHaveLength(5); // empty hand draws 5
  });

  it("lets wildcards move for free and only on your turn", () => {
    const wild = find((c) => c.kind === "wild" && c.colors.length === 2 && c.colors.includes("red"));
    let { envelope } = table((s) => {
      s.props.p1 = [{ color: "red", cards: [wild], house: null, hotel: null }];
    });
    expect(
      propertyDeal.validate(state(envelope), "p2", { type: "move-wild", card: wild, color: "yellow" }, viewCtx(envelope, env)),
    ).toBeTruthy();
    envelope = act(propertyDeal, envelope, "p1", { type: "move-wild", card: wild, color: "yellow" }, env);
    const s = state(envelope);
    expect(s.props.p1).toEqual([{ color: "yellow", cards: [wild], house: null, hotel: null }]);
    expect(s.playsLeft).toBe(3);
  });
});
