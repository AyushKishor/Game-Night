import { describe, expect, it } from "vitest";
import { type TycoonState, rentFor, tycoon } from "@/games/tycoon";
import { type GameEnvelope, viewCtx } from "@/lib/engine/runner";
import { act, makeEnv, simulate, start } from "./sim";

const env = makeEnv(["p1", "p2", "p3"], 1_000_000, []);
function table(patch: (s: TycoonState) => void, config = {}) {
  const { envelope } = start(tycoon, 3, config, "tycoon");
  const s = structuredClone(envelope.state as TycoonState);
  patch(s);
  return { ...envelope, state: s } as GameEnvelope;
}
const st = (e: GameEnvelope) => e.state as TycoonState;
const err = (e: GameEnvelope, p: string, a: object) => tycoon.validate(st(e), p, a as never, viewCtx(e, env));

describe("Tycoon (Monopoly)", () => {
  it("doubles rent for a full set, then charges house rent; builds must be even", () => {
    let e = table((s) => {
      s.owner[1] = "p1";
      s.owner[3] = "p1";
    });
    expect(rentFor(st(e), 1, 7)).toBe(4);
    e = act(tycoon, e, "p1", { type: "build", space: 1 }, env);
    expect(err(e, "p1", { type: "build", space: 1 })).toMatch(/evenly/);
    e = act(tycoon, e, "p1", { type: "build", space: 3 }, env);
    e = act(tycoon, e, "p1", { type: "build", space: 1 }, env);
    expect(rentFor(st(e), 1, 7)).toBe(30);
    expect(st(e).cash.p1).toBe(1500 - 150);
    expect(err(e, "p1", { type: "mortgage", space: 3 })).toMatch(/Sell the buildings/);
  });

  it("railroads and utilities scale with ownership", () => {
    const e = table((s) => {
      s.owner[5] = "p2";
      s.owner[15] = "p2";
      s.owner[25] = "p2";
      s.owner[12] = "p3";
      s.owner[28] = "p3";
    });
    expect(rentFor(st(e), 5, 0)).toBe(100);
    expect(rentFor(st(e), 12, 9)).toBe(90);
  });

  it("goes to auction when you pass, and the highest sealed bid wins", () => {
    let e = table((s) => {
      s.pos.p1 = 39;
      s.phase = "buy";
    });
    e = act(tycoon, e, "p1", { type: "decline" }, env);
    expect(st(e).phase).toBe("auction");
    e = act(tycoon, e, "p1", { type: "bid", amount: 100 }, env);
    e = act(tycoon, e, "p2", { type: "bid", amount: 250 }, env);
    expect(err(e, "p2", { type: "bid", amount: 300 })).toMatch(/already/);
    e = act(tycoon, e, "p3", { type: "bid", amount: 0 }, env);
    expect(st(e).owner[39]).toBe("p2");
    expect(st(e).cash.p2).toBe(1250);
    expect(st(e).phase).toBe("end");
  });

  it("makes you raise cash for debts and hands everything to the creditor on bankruptcy", () => {
    let e = table((s) => {
      s.cash.p1 = 30;
      s.owner[6] = "p1";
      s.debts = [{ from: "p1", to: "p2", amount: 200, reason: "rent" }];
    });
    expect(tycoon.pending(st(e))).toEqual(["p1"]);
    expect(err(e, "p1", { type: "roll" })).toMatch(/debt/);
    expect(err(e, "p1", { type: "pay-debt" })).toMatch(/need/);
    e = act(tycoon, e, "p1", { type: "mortgage", space: 6 }, env);
    expect(st(e).cash.p1).toBe(80);
    e = act(tycoon, e, "p1", { type: "bankrupt" }, env);
    const s = st(e);
    expect(s.bankrupt).toEqual(["p1"]);
    expect(s.owner[6]).toBe("p2");
    expect(s.cash.p2).toBe(1580);
    expect(s.turn).toBe("p2");
  });

  it("trades properties and cash when accepted", () => {
    let e = table((s) => {
      s.owner[1] = "p1";
      s.owner[3] = "p2";
    });
    e = act(
      tycoon,
      e,
      "p1",
      { type: "trade-offer", to: "p2", give: { spaces: [], cash: 200 }, get: { spaces: [3], cash: 0 } },
      env,
    );
    expect(tycoon.pending(st(e))).toEqual(["p2"]);
    e = act(tycoon, e, "p2", { type: "trade-accept" }, env);
    expect(st(e).owner[3]).toBe("p1");
    expect(st(e).cash.p1).toBe(1300);
    expect(st(e).cash.p2).toBe(1700);
  });

  it("three doubles sends you to jail; three failed jail rolls cost $50", () => {
    // Find seeds whose rolls give the situations we need by playing forward.
    const e = table((s) => {
      s.doubles = 2;
      s.phase = "roll";
    });
    let found = false;
    for (let step = 0; step < 200 && !found; step++) {
      const trial = act(tycoon, { ...e, step }, "p1", { type: "roll" }, env);
      const t = st(trial);
      if (t.dice![0] === t.dice![1]) {
        expect(t.inJail).toContain("p1");
        expect(t.pos.p1).toBe(10);
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it("plays whole games to a finish with bots", () => {
    for (const n of [2, 6]) {
      const { envelope } = simulate(tycoon, n, { rounds: 25 }, { seed: `tycoon-${n}`, maxSteps: 20000 });
      expect(tycoon.isOver(st(envelope))).toBe(true);
      expect(st(envelope).winner).toBeTruthy();
    }
  });
});
