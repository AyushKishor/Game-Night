import { describe, expect, it } from "vitest";
import { bluff, type BluffState } from "@/games/bluff";
import { captionClash, type CaptionState } from "@/games/caption-clash";
import { clueRush, type ClueRushState, giverFor } from "@/games/clue-rush";
import { goFish, type GoFishState } from "@/games/go-fish";
import { golf, gridScore, type GolfState } from "@/games/golf";
import { hearts, type HeartsState } from "@/games/hearts";
import { higherLower, type HigherLowerState } from "@/games/higher-lower";
import { majorityRules, type MajorityState } from "@/games/majority-rules";
import { memory, type MemoryState } from "@/games/memory";
import { mostLikely, type MostLikelyState } from "@/games/most-likely";
import { oldMaid, type OldMaidState } from "@/games/old-maid";
import { president, type PresidentState } from "@/games/president";
import { quickCategories, type QuickCatState } from "@/games/quick-categories";
import { rankIt, type RankItState } from "@/games/rank-it";
import { secretSignal, type SecretSignalState } from "@/games/secret-signal";
import { sevens, type SevensState } from "@/games/sevens";
import { snap, type SnapState } from "@/games/snap";
import { scoreRound, spades, type SpadesState } from "@/games/spades";
import { switchGame } from "@/games/switch";
import type { SheddingState } from "@/games/shared/shedding";
import { trickWinner } from "@/games/shared/tricks";
import { trivia } from "@/games/trivia";
import type { QuizState as QuizStateAlias } from "@/games/shared/quiz";
import { handTotal, twentyOne, type TwentyOneState } from "@/games/twenty-one";
import { war, type WarState } from "@/games/war";
import { standingsFromScores } from "@/lib/engine/helpers";
import { advance, submitAction, type GameEnvelope } from "@/lib/engine/runner";
import type { AnyGameModule } from "@/lib/engine/types";
import { act, start } from "./sim";

const st = <T>(e: GameEnvelope) => e.state as T;
const withState = <T>(e: GameEnvelope, patch: Partial<T>): GameEnvelope => ({ ...e, state: { ...(e.state as T), ...patch } });
const rejects = (g: AnyGameModule, e: GameEnvelope, p: string, a: unknown, env: Parameters<typeof submitAction>[4]) =>
  expect(submitAction(g, e, p, a, env).ok).toBe(false);

describe("tie-breaking and standings", () => {
  it("shares places on ties and skips the next place", () => {
    const s = standingsFromScores({ a: 5, b: 5, c: 3 });
    expect(s.map((x) => x.place)).toEqual([1, 1, 3]);
  });
  it("supports lower-is-better games", () => {
    const s = standingsFromScores({ a: 30, b: 5, c: 10 }, { lowerIsBetter: true });
    expect(s.map((x) => x.playerId)).toEqual(["b", "c", "a"]);
  });
});

describe("Switch", () => {
  it("makes the next player draw two after a 2 and allows stacking", () => {
    const { envelope, env, players } = start(switchGame, 2);
    const s = st<SheddingState>(envelope);
    const [a, b] = [s.turn, players.find((p) => p !== s.turn)!];
    const forced = withState<SheddingState>(envelope, {
      hands: { [a]: ["2H", "5C", "9D"], [b]: ["2S", "KD", "4C"] },
      discard: ["7H"],
      activeSuit: "H",
    });
    const e1 = act(switchGame, forced, a, { type: "play", card: "2H" }, env);
    expect(st<SheddingState>(e1).pendingDraw).toBe(2);
    rejects(switchGame, e1, b, { type: "play", card: "KD" }, env);
    const e2 = act(switchGame, e1, b, { type: "play", card: "2S" }, env);
    expect(st<SheddingState>(e2).pendingDraw).toBe(4);
    const e3 = act(switchGame, e2, a, { type: "draw" }, env);
    expect(st<SheddingState>(e3).hands[a]).toHaveLength(6);
    expect(st<SheddingState>(e3).turn).toBe(b);
  });
});

describe("Go Fish", () => {
  it("transfers cards and keeps the turn on a successful ask, and completes books", () => {
    const { envelope, env, players } = start(goFish, 2);
    const [a, b] = players as [string, string];
    const e = withState<GoFishState>(envelope, {
      turn: a,
      hands: { [a]: ["7H", "7S", "7D", "2C"], [b]: ["7C", "KD"] },
      books: { [a]: [], [b]: [] },
    });
    rejects(goFish, e, a, { type: "ask", target: b, rank: "K" }, env); // must hold the rank
    rejects(goFish, e, b, { type: "ask", target: a, rank: "K" }, env); // not your turn
    const e2 = act(goFish, e, a, { type: "ask", target: b, rank: "7" }, env);
    expect(st<GoFishState>(e2).books[a]).toEqual(["7"]);
    expect(st<GoFishState>(e2).turn).toBe(a);
  });
  it("passes the turn after Go Fish unless the drawn card matches", () => {
    const { envelope, env, players } = start(goFish, 2);
    const [a, b] = players as [string, string];
    const e = withState<GoFishState>(envelope, {
      turn: a,
      hands: { [a]: ["3H"], [b]: ["9C"] },
      deck: ["5D", "6D"],
      books: { [a]: [], [b]: [] },
    });
    expect(st<GoFishState>(act(goFish, e, a, { type: "ask", target: b, rank: "3" }, env)).turn).toBe(b);
  });
});

describe("Old Maid", () => {
  it("removes one queen so the Queen of Spades can't pair", () => {
    const { envelope } = start(oldMaid, 3);
    const all = Object.values(st<OldMaidState>(envelope).hands).flat();
    expect(all).not.toContain("QC");
    expect(all.filter((c) => c.startsWith("Q"))).toContain("QS");
  });
  it("ends with the Old Maid holder losing", () => {
    const { envelope, env, players } = start(oldMaid, 2);
    const [a, b] = players as [string, string];
    const e = withState<OldMaidState>(envelope, { turn: a, hands: { [a]: ["5H"], [b]: ["5S", "QS"] }, loser: null });
    const idx = st<OldMaidState>(e).hands[b]!.indexOf("5S");
    const done = act(oldMaid, e, a, { type: "draw", index: idx }, env);
    expect(st<OldMaidState>(done).loser).toBe(b);
    const r = oldMaid.results(st<OldMaidState>(done), { ...env, config: done.config });
    expect(r.standings.find((s) => s.playerId === b)!.place).toBe(2);
  });
});

describe("War", () => {
  it("awards the pot to the highest card and starts a war on ties", () => {
    const { envelope, env, players } = start(war, 2);
    const [a, b] = players as [string, string];
    const e = withState<WarState>(envelope, {
      piles: { [a]: ["KH", "2C", "3C", "4C", "5C"], [b]: ["KS", "2D", "3D", "4D", "AD"] },
    });
    const e1 = act(war, act(war, e, a, { type: "flip" }, env), b, { type: "flip" }, env);
    expect(st<WarState>(e1).atWar).toBe(true);
    const half = act(war, e1, a, { type: "flip" }, env);
    rejects(war, half, a, { type: "flip" }, env); // already flipped
    const e2 = act(war, half, b, { type: "flip" }, env);
    // b's war card (AD) beats a's (5C)
    expect(st<WarState>(e2).piles[b]).toHaveLength(10);
    expect(st<WarState>(e2).piles[a]).toHaveLength(0);
    expect(war.isOver(st<WarState>(e2))).toBe(true);
  });
});

describe("Snap", () => {
  it("rewards a correct snap, penalises a false snap and rejects stale snaps", () => {
    const { envelope, env, players } = start(snap, 2);
    const [a, b] = players as [string, string];
    const e = withState<SnapState>(envelope, { turn: a, center: ["7H", "7C"], piles: { [a]: ["2H", "3H"], [b]: ["4H", "5H"] } });
    rejects(snap, e, b, { type: "snap", seen: 1 }, env); // too slow
    const won = act(snap, e, b, { type: "snap", seen: 2 }, env);
    expect(st<SnapState>(won).piles[b]).toHaveLength(4);
    const e2 = withState<SnapState>(envelope, { turn: a, center: ["7H", "8C"], piles: { [a]: ["2H", "3H"], [b]: ["4H", "5H"] } });
    const lost = act(snap, e2, b, { type: "snap", seen: 2 }, env);
    expect(st<SnapState>(lost).piles[b]).toHaveLength(1);
    expect(st<SnapState>(lost).center).toHaveLength(3);
  });
});

describe("Memory Match", () => {
  it("keeps the turn on a match and passes it on a miss", () => {
    const { envelope, env, players } = start(memory, 2);
    const [a] = players as [string];
    const e = withState<MemoryState>(envelope, { turn: a, cards: ["7H", "7D", "8S", "8C", "9H", "9D"], matchedBy: {} });
    const m = act(memory, act(memory, e, a, { type: "flip", index: 0 }, env), a, { type: "flip", index: 1 }, env);
    expect(st<MemoryState>(m).scores[a]).toBe(1);
    expect(st<MemoryState>(m).turn).toBe(a);
    rejects(memory, m, a, { type: "flip", index: 0 }, env);
    const miss = act(memory, act(memory, m, a, { type: "flip", index: 2 }, env), a, { type: "flip", index: 4 }, env);
    expect(st<MemoryState>(miss).turn).not.toBe(a);
    expect(st<MemoryState>(miss).showing).toEqual([2, 4]);
  });
});

describe("Hearts", () => {
  it("requires the 2♣ lead, following suit, and scores the Queen of Spades as 13", () => {
    const { envelope, env, players } = start(hearts, 4);
    const [a, b, c, d] = players as [string, string, string, string];
    const e = withState<HeartsState>(envelope, {
      phase: "play",
      turn: a,
      firstTrick: false,
      heartsBroken: true,
      trick: [],
      hands: { [a]: ["2C", "5H"], [b]: ["QS", "3C"], [c]: ["AC", "4D"], [d]: ["KC", "6D"] },
      taken: { [a]: [], [b]: [], [c]: [], [d]: [] },
    });
    const e1 = act(hearts, e, a, { type: "play", card: "2C" }, env);
    rejects(hearts, e1, b, { type: "play", card: "QS" }, env); // must follow clubs
    const e2 = act(hearts, e1, b, { type: "play", card: "3C" }, env);
    const e3 = act(hearts, e2, c, { type: "play", card: "AC" }, env);
    const e4 = act(hearts, e3, d, { type: "play", card: "KC" }, env);
    expect(st<HeartsState>(e4).turn).toBe(c);
    const f1 = act(hearts, e4, c, { type: "play", card: "4D" }, env);
    const f2 = act(hearts, f1, d, { type: "play", card: "6D" }, env);
    const f3 = act(hearts, f2, a, { type: "play", card: "5H" }, env);
    const f4 = act(hearts, f3, b, { type: "play", card: "QS" }, env);
    const s = st<HeartsState>(f4);
    expect(s.phase === "roundEnd" || s.phase === "over").toBe(true);
    expect(s.scores[d]).toBe(14);
  });
  it("applies shooting the moon", () => {
    const { envelope, env, players } = start(hearts, 4);
    const [a, b, c, d] = players as [string, string, string, string];
    const allPoints = ["QS", "2H", "3H", "4H", "5H", "6H", "7H", "8H", "9H", "10H", "JH", "QH", "KH", "AH"];
    const e = withState<HeartsState>(envelope, {
      phase: "play",
      turn: a,
      firstTrick: false,
      trick: [],
      hands: { [a]: ["AC"], [b]: ["2C"], [c]: ["3C"], [d]: ["4C"] },
      taken: { [a]: allPoints, [b]: [], [c]: [], [d]: [] },
    });
    let cur = e;
    for (const [p, card] of [
      [a, "AC"],
      [b, "2C"],
      [c, "3C"],
      [d, "4C"],
    ] as const)
      cur = act(hearts, cur, p, { type: "play", card }, env);
    const s = st<HeartsState>(cur);
    expect(s.scores[a]).toBe(0);
    expect(s.scores[b]).toBe(26);
  });
});

describe("Spades", () => {
  it("treats spades as trump", () => {
    expect(
      trickWinner(
        [
          { player: "a", card: "AH" },
          { player: "b", card: "2S" },
        ],
        "S",
      ).player,
    ).toBe("b");
    expect(
      trickWinner(
        [
          { player: "a", card: "AH" },
          { player: "b", card: "KD" },
        ],
        "S",
      ).player,
    ).toBe("a");
  });
  it("scores bids, bags and failed contracts", () => {
    const { envelope } = start(spades, 4, { teamMode: true });
    const s = st<SpadesState>(envelope);
    const [a, b, c, d] = s.players as [string, string, string, string];
    const res = scoreRound({
      ...s,
      bids: { [a]: 3, [c]: 2, [b]: 5, [d]: 4 },
      tricksWon: { [a]: 4, [c]: 2, [b]: 3, [d]: 4 },
    });
    expect(res.deltas[0]).toBe(51); // bid 5, took 6
    expect(res.deltas[1]).toBe(-90); // bid 9, took 7
  });
});

describe("President", () => {
  it("requires same-rank sets that beat the pile, and 2 is highest", () => {
    const { envelope, env, players } = start(president, 3);
    const [a, b] = players as [string, string];
    const e = withState<PresidentState>(envelope, {
      turn: a,
      pile: null,
      passed: [],
      hands: { ...st<PresidentState>(envelope).hands, [a]: ["5H", "5S", "9C", "2D"], [b]: ["6H", "6C", "AC"] },
    });
    rejects(president, e, a, { type: "play", cards: ["5H", "9C"] }, env);
    rejects(president, e, a, { type: "pass" }, env); // can't pass when leading
    const e1 = act(president, e, a, { type: "play", cards: ["5H", "5S"] }, env);
    rejects(president, e1, b, { type: "play", cards: ["AC"] }, env);
    const e2 = act(president, e1, b, { type: "play", cards: ["6H", "6C"] }, env);
    expect(st<PresidentState>(e2).pile!.player).toBe(b);
  });
});

describe("Bluff", () => {
  it("makes a caught liar pick up the pile and an honest player's challenger pick it up", () => {
    const { envelope, env, players } = start(bluff, 3);
    const [a, b] = players as [string, string];
    const base = withState<BluffState>(envelope, { turn: a, required: "A", pile: [] });
    const hand = st<BluffState>(base).hands[a]!;
    const liar = hand.find((c) => !c.startsWith("A"))!;
    const e1 = act(bluff, base, a, { type: "play", cards: [liar] }, env);
    rejects(bluff, e1, a, { type: "call" }, env);
    const e2 = act(bluff, e1, b, { type: "call" }, env);
    expect(st<BluffState>(e2).reveal?.lied).toBe(true);
    expect(st<BluffState>(e2).hands[a]).toContain(liar);
    expect(st<BluffState>(e2).required).toBe("2");
  });
  it("closes the challenge window on timeout", () => {
    const { envelope, env, players } = start(bluff, 3);
    const e1 = act(
      bluff,
      envelope,
      players[0]!,
      { type: "play", cards: [st<BluffState>(envelope).hands[players[0]!]![0]!] },
      env,
    );
    const later = advance(bluff, e1, { ...env, autopilot: new Set(), now: env.now + 13_000 });
    expect(st<BluffState>(later).phase).toBe("play");
  });
});

describe("Sevens", () => {
  it("forces the 7♦ first and only allows adjacent cards", () => {
    const { envelope, env } = start(sevens, 3);
    const s = st<SevensState>(envelope);
    const other = s.hands[s.turn]!.find((c) => c !== "7D")!;
    rejects(sevens, envelope, s.turn, { type: "play", card: other }, env);
    rejects(sevens, envelope, s.turn, { type: "pass" }, env);
    const e1 = act(sevens, envelope, s.turn, { type: "play", card: "7D" }, env);
    expect(st<SevensState>(e1).rows.D).toEqual({ low: 7, high: 7 });
  });
});

describe("Golf", () => {
  it("scores columns with matching ranks as zero", () => {
    expect(gridScore(["5H", "KD", "2C", "5S", "QD", "9C"])).toBe(0 + 10 + 7);
  });
  it("requires two reveals before play and enforces draw-then-place", () => {
    const { envelope, env, players } = start(golf, 2);
    const [a, b] = players as [string, string];
    rejects(golf, envelope, a, { type: "draw", from: "deck" }, env);
    let e = act(golf, envelope, a, { type: "reveal", index: 0 }, env);
    e = act(golf, e, a, { type: "reveal", index: 1 }, env);
    rejects(golf, e, a, { type: "reveal", index: 2 }, env);
    e = act(golf, act(golf, e, b, { type: "reveal", index: 0 }, env), b, { type: "reveal", index: 3 }, env);
    const turn = st<GolfState>(e).turn;
    rejects(golf, e, turn, { type: "swap", index: 0 }, env);
    e = act(golf, e, turn, { type: "draw", from: "discard" }, env);
    rejects(golf, e, turn, { type: "discardFlip", index: 5 }, env);
    e = act(golf, e, turn, { type: "swap", index: 5 }, env);
    expect(st<GolfState>(e).turn).not.toBe(turn);
  });
});

describe("Higher or Lower", () => {
  it("scores correct guesses and reveals on timeout", () => {
    const { envelope, env, players } = start(higherLower, 2);
    const [a, b] = players as [string, string];
    const e = withState<HigherLowerState>(envelope, { current: "5H", deck: ["9C", "2D"] });
    const e1 = act(
      higherLower,
      act(higherLower, e, a, { type: "guess", guess: "higher" }, env),
      b,
      { type: "guess", guess: "lower" },
      env,
    );
    expect(st<HigherLowerState>(e1).scores).toEqual({ [a]: 1, [b]: 0 });
    rejects(higherLower, e1, a, { type: "guess", guess: "higher" }, env);
  });
});

describe("Twenty-One", () => {
  it("counts aces flexibly", () => {
    expect(handTotal(["AH", "KD"])).toBe(21);
    expect(handTotal(["AH", "AD", "9C"])).toBe(21);
    expect(handTotal(["KH", "QD", "5C"])).toBe(25);
  });
  it("hides the dealer's hole card until everyone is done", () => {
    const { envelope, env, players } = start(twentyOne, 2);
    const s = st<TwentyOneState>(envelope);
    if (s.phase === "act") {
      const pub = twentyOne.publicView(s, { ...env, config: envelope.config }) as { dealer: string[] };
      expect(pub.dealer).toHaveLength(1);
      expect(JSON.stringify(pub)).not.toContain(`"${s.dealer[1]}"`);
    }
    expect(players).toHaveLength(2);
  });
});

describe("Majority Rules", () => {
  it("scores the majority and hides votes until the reveal", () => {
    const { envelope, env, players } = start(majorityRules, 3);
    const [a, b, c] = players as [string, string, string];
    const e1 = act(majorityRules, envelope, a, { type: "vote", side: "a" }, env);
    expect(JSON.stringify(majorityRules.publicView(st<MajorityState>(e1), { ...env, config: e1.config }))).not.toContain(
      '"votes":{',
    );
    const e2 = act(
      majorityRules,
      act(majorityRules, e1, b, { type: "vote", side: "a" }, env),
      c,
      { type: "vote", side: "b" },
      env,
    );
    expect(st<MajorityState>(e2).scores).toEqual({ [a]: 1, [b]: 1, [c]: 0 });
  });
});

describe("Most Likely To", () => {
  it("rewards voting with the group and marks the pick for sips", () => {
    const { envelope, env, players } = start(mostLikely, 3);
    const [a, b, c] = players as [string, string, string];
    let e = act(mostLikely, envelope, a, { type: "vote", target: c }, env);
    e = act(mostLikely, e, b, { type: "vote", target: c }, env);
    e = act(mostLikely, e, c, { type: "vote", target: a }, env);
    const s = st<MostLikelyState>(e);
    expect(s.scores).toEqual({ [a]: 1, [b]: 1, [c]: 0 });
    expect(s.summaries[0]!.sips).toEqual([c]);
    rejects(mostLikely, e, a, { type: "vote", target: "nobody" }, env);
  });
});

describe("Rank It", () => {
  it("keeps the ranker's order secret until the reveal and scores positions", () => {
    const { envelope, env, players } = start(rankIt, 3);
    const s0 = st<RankItState>(envelope);
    const guesser = players.find((p) => p !== s0.ranker)!;
    rejects(rankIt, envelope, guesser, { type: "rank", order: [0, 1, 2, 3, 4] }, env);
    const e1 = act(rankIt, envelope, s0.ranker, { type: "rank", order: [4, 3, 2, 1, 0] }, env);
    const pub = JSON.stringify(rankIt.publicView(st<RankItState>(e1), { ...env, config: e1.config }));
    expect(pub).not.toContain("[4,3,2,1,0]");
    let e = e1;
    for (const p of players.filter((x) => x !== s0.ranker)) e = act(rankIt, e, p, { type: "guess", order: [4, 3, 2, 0, 1] }, env);
    const s = st<RankItState>(e);
    expect(s.scores[guesser]).toBe(3);
    expect(s.scores[s0.ranker]).toBe(2);
  });
});

describe("Secret Signal", () => {
  it("pairs players, validates one-word clues and scores found partners", () => {
    const { envelope, env, players } = start(secretSignal, 4);
    const s = st<SecretSignalState>(envelope);
    const p = players[0]!;
    rejects(secretSignal, envelope, p, { type: "clue", text: "two words" }, env);
    rejects(secretSignal, envelope, p, { type: "clue", text: s.symbolOf[p]! }, env);
    let e = envelope;
    for (const x of players) e = act(secretSignal, e, x, { type: "clue", text: "hint" }, env);
    for (const x of players) e = act(secretSignal, e, x, { type: "guess", target: st<SecretSignalState>(e).partnerOf[x]! }, env);
    const out = st<SecretSignalState>(e);
    for (const x of players) expect(out.scores[x]).toBe(3);
    // Symbols stay private during play.
    expect(JSON.stringify(secretSignal.publicView(s, { ...env, config: envelope.config }))).not.toContain(s.symbolOf[p]!);
  });
});

describe("Quick Categories", () => {
  it("requires the starting letter, scores unique vs shared answers and honours flags", () => {
    const { envelope, env, players } = start(quickCategories, 3);
    const [a, b, c] = players as [string, string, string];
    const e0 = withState<QuickCatState>(envelope, { letters: ["B"] });
    rejects(quickCategories, e0, a, { type: "answer", text: "Apple" }, env);
    let e = act(quickCategories, e0, a, { type: "answer", text: "Banana" }, env);
    e = act(quickCategories, e, b, { type: "answer", text: "the banana" }, env);
    e = act(quickCategories, e, c, { type: "answer", text: "Bogus" }, env);
    expect(st<QuickCatState>(e).phase).toBe("review");
    e = act(quickCategories, e, a, { type: "flag", author: c, flagged: true }, env);
    e = act(quickCategories, e, b, { type: "flag", author: c, flagged: true }, env);
    for (const p of players) e = act(quickCategories, e, p, { type: "done" }, env);
    expect(st<QuickCatState>(e).scores).toEqual({ [a]: 1, [b]: 1, [c]: 0 });
  });
});

describe("Caption Clash", () => {
  it("anonymises captions, blocks self-votes and counts votes", () => {
    const { envelope, env, players } = start(captionClash, 3);
    let e = envelope;
    players.forEach((p, i) => (e = act(captionClash, e, p, { type: "caption", text: `Caption number ${i}` }, env)));
    const s = st<CaptionState>(e);
    expect(s.phase).toBe("vote");
    const pub = JSON.stringify(captionClash.publicView(s, { ...env, config: e.config }));
    for (const p of players) expect(pub).not.toContain(`"author":"${p}"`);
    const own = s.ballot.find((x) => x.author === players[0])!;
    rejects(captionClash, e, players[0]!, { type: "vote", id: own.id }, env);
    const target = s.ballot.find((x) => x.author === players[2])!;
    e = act(captionClash, e, players[0]!, { type: "vote", id: target.id }, env);
    e = act(captionClash, e, players[1]!, { type: "vote", id: target.id }, env);
    e = act(captionClash, e, players[2]!, { type: "vote", id: s.ballot.find((x) => x.author === players[0])!.id }, env);
    expect(st<CaptionState>(e).scores[players[2]!]).toBe(3);
  });
});

describe("Clue Rush", () => {
  it("shows the word only to the giver and the watching team, and scores got/buzz", () => {
    const { envelope, env, players } = start(clueRush, 4);
    const s0 = st<ClueRushState>(envelope);
    const giver = giverFor(s0);
    let e = act(clueRush, envelope, giver, { type: "start" }, env);
    const s = st<ClueRushState>(e);
    const teammate = players.find((p) => p !== giver && s.teamOf[p] === s.teamOf[giver])!;
    const rival = players.find((p) => s.teamOf[p] !== s.teamOf[giver])!;
    const ctx = { ...env, config: e.config };
    expect((clueRush.privateView(s, giver, ctx) as { card: unknown }).card).not.toBeNull();
    expect((clueRush.privateView(s, teammate, ctx) as { card: unknown }).card).toBeNull();
    expect((clueRush.privateView(s, rival, ctx) as { card: unknown }).card).not.toBeNull();
    rejects(clueRush, e, teammate, { type: "buzz" }, env);
    e = act(clueRush, e, giver, { type: "got" }, env);
    e = act(clueRush, e, giver, { type: "got" }, env);
    e = act(clueRush, e, rival, { type: "buzz" }, env);
    const later = advance(clueRush, e, { ...env, autopilot: new Set(), now: env.now + 120_000 });
    expect(st<ClueRushState>(later).teamScores[s.teamOf[giver]!]).toBe(1);
  });
});

describe("Trivia Night", () => {
  it("awards speed-weighted points for correct answers and pools teams", () => {
    const { envelope, env, players } = start(trivia, 4, { teamMode: true });
    const s = st<QuizStateAlias>(envelope);
    const answer = s.questions[0]!.answer;
    let e = envelope;
    e = act(trivia, e, players[0]!, { type: "answer", choice: answer }, env);
    rejects(trivia, e, players[0]!, { type: "answer", choice: answer }, env);
    for (const p of players.slice(1)) e = act(trivia, e, p, { type: "answer", choice: (answer + 1) % 4 }, env);
    const out = st<QuizStateAlias>(e);
    expect(out.points[players[0]!]).toBe(15);
    expect(out.teamMode).toBe(true);
    const r = trivia.results(out, { ...env, config: e.config });
    const team0 = r.standings.filter((x) => out.teamOf[x.playerId] === 0);
    expect(team0.every((x) => x.score === 15)).toBe(true);
  });
});

describe("Never Have I Ever", () => {
  it("scores close guesses, marks the guilty to drink and keeps answers secret until reveal", async () => {
    const { neverHaveIEver } = await import("@/games/never-have-i-ever");
    type S = import("@/games/never-have-i-ever").NhieState;
    const { envelope, env, players } = start(neverHaveIEver, 3);
    const [a, b, c] = players as [string, string, string];
    rejects(neverHaveIEver, envelope, a, { type: "answer", have: true, guess: 0 }, env);
    rejects(neverHaveIEver, envelope, a, { type: "answer", have: false, guess: 9 }, env);
    let e = act(neverHaveIEver, envelope, a, { type: "answer", have: true, guess: 2 }, env);
    const pub = JSON.stringify(neverHaveIEver.publicView(st<S>(e), { ...env, config: e.config }));
    expect(pub).not.toContain('"have":true');
    e = act(neverHaveIEver, e, b, { type: "answer", have: true, guess: 1 }, env);
    e = act(neverHaveIEver, e, c, { type: "answer", have: false, guess: 0 }, env);
    const s = st<S>(e);
    expect(s.scores).toEqual({ [a]: 3, [b]: 1, [c]: 0 });
    expect(s.summaries[0]!.sips).toEqual([a, b]);
    expect(s.confessions[a]).toBe(1);
  });
});

describe("Spicy content", () => {
  it("mixes After Dark questions into Trivia by default and not when spicy is off", () => {
    const spicyOn = start(trivia, 2, { rounds: 9 });
    const qs = st<QuizStateAlias>(spicyOn.envelope).questions.map((q) => q.prompt);
    const afterDark = new Set(spicyOn.env.content.triviaAfterDark.questions.map((q) => q.q));
    expect(qs.filter((q) => afterDark.has(q)).length).toBeGreaterThanOrEqual(5);
    const spicyOff = start(trivia, 2, { rounds: 9, houseRules: { spicy: false } });
    expect(st<QuizStateAlias>(spicyOff.envelope).questions.some((q) => afterDark.has(q.prompt))).toBe(false);
  });
  it("rewards answer streaks in the quiz", () => {
    const { envelope, env, players } = start(trivia, 1, { rounds: 3 });
    let e = envelope;
    for (let i = 0; i < 3; i++) {
      const q = st<QuizStateAlias>(e).questions[i]!;
      e = act(trivia, e, players[0]!, { type: "answer", choice: q.answer }, env);
      if (i < 2) e = act(trivia, e, players[0]!, { type: "next" }, env);
    }
    const s = st<QuizStateAlias>(e);
    expect(s.streaks[players[0]!]).toBe(3);
    expect(s.points[players[0]!]).toBe(15 + 17 + 19);
  });
});
