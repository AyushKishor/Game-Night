import { describe, expect, it } from "vitest";
import { type CodeWordsState, codeWords } from "@/games/code-words";
import { type ColourClashState, UNO_DECK, colourClash } from "@/games/colour-clash";
import { type PowerGrabState, powerGrab } from "@/games/power-grab";
import { type HoldemState, bestHand, texasHoldem } from "@/games/texas-holdem";
import type { GameEnvelope } from "@/lib/engine/runner";
import { viewCtx } from "@/lib/engine/runner";
import type { AnyGameModule } from "@/lib/engine/types";
import { act, makeEnv, simulate, start } from "./sim";

function setup<S>(game: AnyGameModule, n: number, patch: (s: S) => void, config = {}) {
  const { envelope } = start(game, n, config, "classic");
  const s = structuredClone(envelope.state as S);
  patch(s);
  return { ...envelope, state: s } as GameEnvelope;
}
const env3 = makeEnv(["p1", "p2", "p3"], 1_000_000, []);
const env4 = makeEnv(["p1", "p2", "p3", "p4"], 1_000_000, []);
const env2 = makeEnv(["p1", "p2"], 1_000_000, []);
const st = <S>(e: GameEnvelope) => e.state as S;

describe("Colour Clash (UNO)", () => {
  const find = (color: string | null, kind: string, n: number | null = null, skip = 0) =>
    UNO_DECK.filter((c) => c.color === color && c.kind === kind && (n === null || c.n === n))[skip]!.id;

  it("has the 108-card deck", () => expect(UNO_DECK).toHaveLength(108));

  it("stacks draw cards and the player who can't stack picks up the lot", () => {
    const r2 = find("R", "draw2");
    const b2 = find("B", "draw2");
    let e = setup<ColourClashState>(colourClash, 3, (s) => {
      s.discard = [find("R", "num", 5)];
      s.color = "R";
      s.hands.p1 = [r2, find("G", "num", 1)];
      s.hands.p2 = [b2, find("G", "num", 2)];
      s.hands.p3 = [find("Y", "num", 3), find("Y", "num", 4)];
    });
    e = act(colourClash, e, "p1", { type: "play", card: r2, uno: true }, env3);
    expect(
      colourClash.validate(st<ColourClashState>(e), "p2", { type: "play", card: find("G", "num", 2) }, viewCtx(e, env3)),
    ).toMatch(/Stack/);
    e = act(colourClash, e, "p2", { type: "play", card: b2, uno: true }, env3);
    expect(st<ColourClashState>(e).pendingDraw).toBe(4);
    e = act(colourClash, e, "p3", { type: "draw" }, env3);
    const s = st<ColourClashState>(e);
    expect(s.hands.p3).toHaveLength(6);
    expect(s.turn).toBe("p1");
  });

  it("wilds need a colour; reverse skips with two players; forgetting UNO can get you caught", () => {
    const wild = find(null, "wild");
    const rev = find("R", "reverse");
    let e = setup<ColourClashState>(colourClash, 2, (s) => {
      s.discard = [find("R", "num", 5)];
      s.color = "R";
      s.hands.p1 = [rev, wild, find("G", "num", 7)];
      s.hands.p2 = [find("Y", "num", 3), find("Y", "num", 4)];
    });
    expect(colourClash.validate(st<ColourClashState>(e), "p1", { type: "play", card: wild }, viewCtx(e, env2))).toMatch(/colour/);
    e = act(colourClash, e, "p1", { type: "play", card: rev }, env2);
    expect(st<ColourClashState>(e).turn).toBe("p1");
    e = act(colourClash, e, "p1", { type: "play", card: wild, color: "G" }, env2);
    expect(st<ColourClashState>(e).vulnerable).toBe("p1");
    e = act(colourClash, e, "p2", { type: "catch", target: "p1" }, env2);
    expect(st<ColourClashState>(e).hands.p1).toHaveLength(3);
  });

  it("going out scores everyone else's cards", () => {
    const last = find("R", "num", 9);
    let e = setup<ColourClashState>(
      colourClash,
      2,
      (s) => {
        s.discard = [find("R", "num", 5)];
        s.color = "R";
        s.hands.p1 = [last];
        s.hands.p2 = [find(null, "wild4"), find("Y", "skip"), find("Y", "num", 4)];
      },
      { rounds: 2 },
    );
    e = act(colourClash, e, "p1", { type: "play", card: last }, env2);
    const s = st<ColourClashState>(e);
    expect(s.scores.p1).toBe(74);
    expect(s.phase).toBe("roundEnd");
  });
});

describe("Power Grab (Coup)", () => {
  const role = (r: string, i = 0) => {
    const base = { duke: 0, assassin: 3, captain: 6, ambassador: 9, contessa: 12 }[r]!;
    return `k${base + i + 1}`;
  };

  it("a failed challenge costs the challenger a card and the claimant gets a fresh one", () => {
    let e = setup<PowerGrabState>(powerGrab, 3, (s) => {
      s.cards.p1 = [
        { id: role("duke"), lost: false },
        { id: role("captain"), lost: false },
      ];
      s.cards.p2 = [
        { id: role("contessa"), lost: false },
        { id: role("assassin"), lost: false },
      ];
      s.cards.p3 = [
        { id: role("ambassador"), lost: false },
        { id: role("duke", 1), lost: false },
      ];
      s.deck = s.deck.filter(
        (c) =>
          ![role("duke"), role("captain"), role("contessa"), role("assassin"), role("ambassador"), role("duke", 1)].includes(c),
      );
    });
    e = act(powerGrab, e, "p1", { type: "act", kind: "tax" }, env3);
    e = act(powerGrab, e, "p2", { type: "challenge" }, env3);
    let s = st<PowerGrabState>(e);
    expect(s.stage.k).toBe("lose");
    expect(s.cards.p1!.map((c) => c.id)).not.toContain(role("duke"));
    e = act(powerGrab, e, "p2", { type: "lose", card: role("assassin") }, env3);
    s = st<PowerGrabState>(e);
    expect(s.coins.p1).toBe(5);
    expect(s.turn).toBe("p2");
  });

  it("a caught bluff fails, refunds the assassin's coins and costs the liar a card", () => {
    let e = setup<PowerGrabState>(powerGrab, 3, (s) => {
      s.coins.p1 = 3;
      s.cards.p1 = [
        { id: role("duke"), lost: false },
        { id: role("captain"), lost: false },
      ];
    });
    e = act(powerGrab, e, "p1", { type: "act", kind: "assassinate", target: "p2" }, env3);
    expect(st<PowerGrabState>(e).coins.p1).toBe(0);
    e = act(powerGrab, e, "p3", { type: "challenge" }, env3);
    e = act(powerGrab, e, "p1", { type: "lose", card: role("captain") }, env3);
    const s = st<PowerGrabState>(e);
    expect(s.coins.p1).toBe(3);
    expect(s.cards.p2!.every((c) => !c.lost)).toBe(true);
  });

  it("blocks can be allowed, and 10 coins forces a coup", () => {
    let e = setup<PowerGrabState>(powerGrab, 3, () => {});
    e = act(powerGrab, e, "p1", { type: "act", kind: "foreignAid" }, env3);
    e = act(powerGrab, e, "p2", { type: "block", role: "duke" }, env3);
    e = act(powerGrab, e, "p1", { type: "allow" }, env3);
    e = act(powerGrab, e, "p3", { type: "allow" }, env3);
    expect(st<PowerGrabState>(e).coins.p1).toBe(2);
    expect(st<PowerGrabState>(e).turn).toBe("p2");
    const rich = setup<PowerGrabState>(powerGrab, 3, (s) => (s.coins.p1 = 10));
    expect(powerGrab.validate(st(rich), "p1", { type: "act", kind: "income" }, viewCtx(rich, env3))).toMatch(/must Coup/);
  });

  it("never shows face-down roles publicly", () => {
    simulate(
      powerGrab,
      5,
      {},
      {
        seed: "coup-privacy",
        onStep: (e) => {
          const s = e.state as PowerGrabState;
          const pub = JSON.stringify(powerGrab.publicView(s, viewCtx(e, makeEnv(e.players))));
          for (const p of e.players) for (const c of s.cards[p]!) if (!c.lost) expect(pub).not.toContain(`"${c.id}"`);
        },
      },
    );
  });
});

describe("Code Words (Codenames)", () => {
  it("only spymasters see the key, and the host is never a spymaster when avoidable", () => {
    const { envelope, env } = start(codeWords, 6);
    const s = st<CodeWordsState>(envelope);
    expect(s.spymasters).not.toContain("p1");
    const ctx = viewCtx(envelope, env);
    for (const p of envelope.players) {
      const v = codeWords.privateView(s, p, ctx) as { key: unknown };
      expect(!!v.key).toBe(s.spymasters.includes(p));
    }
    const pub = codeWords.publicView(s, ctx) as { revealedKey: unknown[] };
    expect(pub.revealedKey.every((k) => k === null)).toBe(true);
    expect(s.key.filter((k) => k === "A")).toHaveLength(9);
  });

  it("rejects clues on the board and ends on the assassin", () => {
    let e = setup<CodeWordsState>(codeWords, 4, () => {});
    const s = st<CodeWordsState>(e);
    const spy = s.spymasters[0];
    expect(
      codeWords.validate(s, spy, { type: "clue", word: s.words[3]!.replace(/ /g, ""), number: 1 }, viewCtx(e, env4)),
    ).toMatch(/too close/);
    expect(codeWords.validate(s, spy, { type: "clue", word: "two words", number: 1 }, viewCtx(e, env4))).toBeTruthy();
    e = act(codeWords, e, spy, { type: "clue", word: "ZZYZX", number: 2 }, env4);
    const guesser = e.players.find((p) => st<CodeWordsState>(e).teams[p] === 0 && p !== spy)!;
    const assassin = st<CodeWordsState>(e).key.indexOf("X");
    e = act(codeWords, e, guesser, { type: "guess", index: assassin }, env4);
    expect(st<CodeWordsState>(e).winner).toBe(1);
  });
});

describe("Texas Hold'em", () => {
  it("ranks hands correctly", () => {
    expect(bestHand(["AS", "KS", "QS", "JS", "10S", "2D", "3C"]).name).toBe("Straight Flush");
    expect(bestHand(["AS", "2D", "3C", "4H", "5S", "KD", "KC"]).name).toBe("Straight");
    expect(bestHand(["AH", "AD", "AC", "KS", "KD", "2C", "3C"]).name).toBe("Full House");
  });

  it("builds side pots for all-ins", () => {
    let e = setup<HoldemState>(texasHoldem, 3, (s) => {
      s.stacks = { p1: 100, p2: 300, p3: 300 };
      s.bets = { p1: 0, p2: 0, p3: 0 };
      s.committed = { p1: 0, p2: 0, p3: 0 };
      s.currentBet = 0;
      s.acted = [];
      s.toAct = "p1";
      s.holes = { p1: ["AS", "AH"], p2: ["KS", "KH"], p3: ["2C", "7D"] };
      s.board = [];
      s.deck = ["3D", "AD", "KD", "9C", "4S", "QH", "5C", "8H", "JH", "6S"];
    });
    e = act(texasHoldem, e, "p1", { type: "raise", to: 100 }, env3);
    e = act(texasHoldem, e, "p2", { type: "raise", to: 300 }, env3);
    e = act(texasHoldem, e, "p3", { type: "call" }, env3);
    const s = st<HoldemState>(e);
    expect(["showdown", "over"]).toContain(s.phase);
    // p1 (trip aces) wins the 300 main pot, p2 (trip kings) the 400 side pot.
    expect(s.stacks.p1).toBe(300);
    expect(s.stacks.p2).toBe(400);
    expect(s.stacks.p3).toBe(0);
  });

  it("keeps every chip in play through whole games", () => {
    for (const n of [2, 5, 9]) {
      simulate(
        texasHoldem,
        n,
        {},
        {
          seed: `chips-${n}`,
          onStep: (e) => {
            const s = e.state as HoldemState;
            const total =
              Object.values(s.stacks).reduce((a, b) => a + b, 0) +
              (s.phase === "betting" ? s.inHand.reduce((a, p) => a + s.committed[p]!, 0) : 0);
            expect(total).toBe(n * 1000);
          },
        },
      );
    }
  });
});
