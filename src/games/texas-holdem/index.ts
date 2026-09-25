import { z } from "zod";
import { type CardId, cardLabel, rankValue, shuffledDeck, suitOf } from "@/lib/engine/cards";
import { REVEAL_SECONDS, deadlineFrom, nameOf, pushLog, resultsFromScores } from "@/lib/engine/helpers";
import type { GameContext, GameModule, PlayerId } from "@/lib/engine/types";
import { bestHand, compareScores } from "./hand";

export { bestHand } from "./hand";

const START_STACK = 1000;
const BASE_BB = 20;
export const STREETS = ["Pre-flop", "Flop", "Turn", "River"] as const;

export interface HoldemState {
  players: PlayerId[];
  stacks: Record<PlayerId, number>;
  dealer: PlayerId;
  hand: number;
  maxHands: number;
  phase: "betting" | "showdown" | "over";
  street: number;
  deck: CardId[];
  holes: Record<PlayerId, CardId[]>;
  board: CardId[];
  inHand: PlayerId[];
  folded: PlayerId[];
  allIn: PlayerId[];
  bets: Record<PlayerId, number>;
  committed: Record<PlayerId, number>;
  currentBet: number;
  minRaise: number;
  acted: PlayerId[];
  toAct: PlayerId | null;
  blinds: { sb: number; bb: number; sbPlayer: PlayerId; bbPlayer: PlayerId };
  deadline: number | null;
  shown: Record<PlayerId, CardId[]>;
  result: { winners: { player: PlayerId; amount: number; hand: string | null }[]; lines: string[] } | null;
  lastAction: { player: PlayerId; text: string } | null;
  log: string[];
}

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("fold") }),
  z.object({ type: z.literal("check") }),
  z.object({ type: z.literal("call") }),
  z.object({ type: z.literal("raise"), to: z.number().int().positive().max(10_000_000) }),
  z.object({ type: z.literal("next") }),
]);
type Action = z.infer<typeof actionSchema>;

const live = (s: HoldemState) => s.inHand.filter((p) => !s.folded.includes(p));
const canAct = (s: HoldemState, p: PlayerId) => !s.folded.includes(p) && !s.allIn.includes(p);
const needsAct = (s: HoldemState, p: PlayerId) => canAct(s, p) && (!s.acted.includes(p) || s.bets[p]! < s.currentBet);

function seatAfter(s: HoldemState, from: PlayerId, pred: (p: PlayerId) => boolean): PlayerId | null {
  const order = s.inHand;
  const start = order.indexOf(from);
  for (let k = 1; k <= order.length; k++) {
    const p = order[(start + k + order.length) % order.length]!;
    if (pred(p)) return p;
  }
  return null;
}

export function blindsFor(hand: number, maxHands: number) {
  const level = Math.floor((hand - 1) / Math.max(2, Math.ceil(maxHands / 4)));
  const bb = BASE_BB * 2 ** level;
  return { sb: bb / 2, bb };
}

function put(s: HoldemState, p: PlayerId, amount: number) {
  const pay = Math.min(amount, s.stacks[p]!);
  s.stacks[p]! -= pay;
  s.bets[p]! += pay;
  s.committed[p]! += pay;
  if (s.stacks[p] === 0 && !s.allIn.includes(p)) s.allIn.push(p);
  return pay;
}

function startHand(s: HoldemState, ctx: GameContext) {
  const seated = s.players.filter((p) => s.stacks[p]! > 0);
  if (seated.length < 2 || s.hand >= s.maxHands) {
    s.phase = "over";
    s.deadline = null;
    s.toAct = null;
    return;
  }
  s.hand += 1;
  // Move the button to the next player who still has chips.
  const di = s.players.indexOf(s.dealer);
  for (let k = 1; k <= s.players.length; k++) {
    const p = s.players[(di + k) % s.players.length]!;
    if (s.stacks[p]! > 0) {
      s.dealer = p;
      break;
    }
  }
  s.inHand = seated;
  s.folded = [];
  s.allIn = [];
  s.board = [];
  s.street = 0;
  s.shown = {};
  s.result = null;
  s.lastAction = null;
  s.phase = "betting";
  s.bets = Object.fromEntries(s.players.map((p) => [p, 0]));
  s.committed = Object.fromEntries(s.players.map((p) => [p, 0]));
  s.deck = shuffledDeck(ctx.rng);
  s.holes = Object.fromEntries(s.players.map((p) => [p, seated.includes(p) ? s.deck.splice(0, 2) : []]));
  const { sb, bb } = blindsFor(s.hand, s.maxHands);
  const headsUp = seated.length === 2;
  const sbPlayer = headsUp ? s.dealer : seatAfter(s, s.dealer, () => true)!;
  const bbPlayer = seatAfter(s, sbPlayer, () => true)!;
  put(s, sbPlayer, sb);
  put(s, bbPlayer, bb);
  s.blinds = { sb, bb, sbPlayer, bbPlayer };
  s.currentBet = bb;
  s.minRaise = bb;
  s.acted = [];
  s.log = pushLog(s.log, `Hand ${s.hand}: blinds ${sb}/${bb}. ${nameOf(ctx, s.dealer)} has the button.`);
  s.toAct = seatAfter(s, bbPlayer, (p) => needsAct(s, p));
  settle(s, ctx);
}

function award(s: HoldemState, ctx: GameContext) {
  const contenders = live(s);
  const lines: string[] = [];
  const winnings: Record<PlayerId, number> = {};
  const handNames: Record<PlayerId, string> = {};
  if (contenders.length === 1) {
    const w = contenders[0]!;
    const pot = s.inHand.reduce((n, p) => n + s.committed[p]!, 0);
    winnings[w] = pot;
    lines.push(`${nameOf(ctx, w)} takes ${pot} — everyone else folded.`);
  } else {
    const scores = Object.fromEntries(contenders.map((p) => [p, bestHand([...s.holes[p]!, ...s.board])]));
    for (const p of contenders) {
      s.shown[p] = s.holes[p]!;
      handNames[p] = scores[p]!.name;
    }
    const levels = [...new Set(s.inHand.map((p) => s.committed[p]!).filter((n) => n > 0))].sort((a, b) => a - b);
    let prev = 0;
    levels.forEach((level, i) => {
      const pot = s.inHand.reduce((n, p) => n + Math.max(0, Math.min(s.committed[p]!, level) - prev), 0);
      const eligible = contenders.filter((p) => s.committed[p]! >= level);
      prev = level;
      if (!pot) return;
      if (!eligible.length) {
        // Nobody left to claim it (all folded) — give it back to whoever put it in.
        for (const p of s.inHand)
          winnings[p] = (winnings[p] ?? 0) + Math.max(0, Math.min(s.committed[p]!, level) - (levels[i - 1] ?? 0));
        return;
      }
      let best = [eligible[0]!];
      for (const p of eligible.slice(1)) {
        const c = compareScores(scores[p]!.score, scores[best[0]!]!.score);
        if (c > 0) best = [p];
        else if (c === 0) best.push(p);
      }
      const share = Math.floor(pot / best.length);
      let rest = pot - share * best.length;
      // Odd chips go to the first winner left of the button.
      const ordered = [...best].sort((a, b) => seatDistance(s, a) - seatDistance(s, b));
      for (const w of ordered) {
        winnings[w] = (winnings[w] ?? 0) + share + (rest > 0 ? 1 : 0);
        rest -= 1;
      }
      const label = levels.length > 1 ? (i === 0 ? "Main pot" : `Side pot ${i}`) : "Pot";
      lines.push(`${label} (${pot}): ${best.map((w) => nameOf(ctx, w)).join(" & ")} with ${scores[best[0]!]!.name}`);
    });
  }
  for (const [p, amt] of Object.entries(winnings)) s.stacks[p]! += amt;
  s.result = {
    winners: Object.entries(winnings)
      .filter(([p]) => contenders.includes(p))
      .map(([player, amount]) => ({ player, amount, hand: handNames[player] ?? null })),
    lines,
  };
  s.log = pushLog(s.log, ...lines);
  s.phase = "showdown";
  s.toAct = null;
  s.deadline = deadlineFrom(ctx.now, REVEAL_SECONDS);
  const busted = s.inHand.filter((p) => s.stacks[p] === 0);
  for (const p of busted) s.log = pushLog(s.log, `💸 ${nameOf(ctx, p)} is out of chips.`);
  if (s.players.filter((p) => s.stacks[p]! > 0).length < 2 || s.hand >= s.maxHands) {
    s.phase = "over";
    s.deadline = null;
  }
}

function seatDistance(s: HoldemState, p: PlayerId) {
  const n = s.players.length;
  return (s.players.indexOf(p) - s.players.indexOf(s.dealer) + n - 1) % n;
}

function dealStreet(s: HoldemState) {
  s.street += 1;
  s.deck.shift(); // burn
  s.board.push(...s.deck.splice(0, s.street === 1 ? 3 : 1));
}

/** Move the hand forward until someone has to decide (or it's over). */
function settle(s: HoldemState, ctx: GameContext) {
  for (let guard = 0; guard < 10; guard++) {
    if (live(s).length === 1) return award(s, ctx);
    if (s.toAct && needsAct(s, s.toAct)) {
      s.deadline = deadlineFrom(ctx.now, ctx.config.turnSeconds);
      return;
    }
    const next = s.toAct ? seatAfter(s, s.toAct, (p) => needsAct(s, p)) : null;
    if (next) {
      s.toAct = next;
      continue;
    }
    // Betting round complete.
    s.bets = Object.fromEntries(s.players.map((p) => [p, 0]));
    s.currentBet = 0;
    s.minRaise = s.blinds.bb;
    s.acted = [];
    if (s.street === 3) return award(s, ctx);
    const actors = live(s).filter((p) => canAct(s, p));
    if (actors.length <= 1) {
      while (s.street < 3) dealStreet(s);
      return award(s, ctx);
    }
    dealStreet(s);
    s.log = pushLog(s.log, `${STREETS[s.street]}: ${s.board.map(cardLabel).join(" ")}`);
    s.toAct = seatAfter(s, s.dealer, (p) => needsAct(s, p));
  }
}

function preflopStrength(hole: CardId[]): number {
  const [a, b] = hole.map((c) => rankValue(c, true)).sort((x, y) => y - x) as [number, number];
  let score = (a + b) / 28;
  if (a === b) score = 0.55 + a / 30;
  if (suitOf(hole[0]!) === suitOf(hole[1]!)) score += 0.06;
  if (a - b === 1) score += 0.04;
  return Math.min(1, score);
}

function strength(s: HoldemState, p: PlayerId): number {
  if (s.board.length === 0) return preflopStrength(s.holes[p]!);
  const cat = bestHand([...s.holes[p]!, ...s.board]).score[0]!;
  return [0.2, 0.5, 0.7, 0.8, 0.86, 0.9, 0.95, 0.99, 1][cat]!;
}

export const texasHoldem: GameModule<HoldemState, Action> = {
  meta: {
    id: "texas-holdem",
    name: "Texas Hold'em",
    tagline: "No-limit poker. Two secret cards, five on the table, all-in on a bluff.",
    category: "card",
    minPlayers: 2,
    maxPlayers: 9,
    duration: "20–45 min",
    icon: "Coins",
    accent: "mint",
    supportsBots: true,
    rules: {
      goal: "Win chips. After the last hand, the biggest stack wins.",
      steps: [
        `Everyone starts with ${START_STACK} chips. The two players after the button post the small and big blinds, which go up during the game.`,
        "You get two secret cards. Betting goes round: fold, check, call, or raise (no limit — you can go all-in any time).",
        "Then three shared cards (the flop), one more (the turn) and a last one (the river), with a betting round after each.",
        "At the showdown the best five-card hand from your two cards plus the five on the table wins the pot. Side pots handle all-ins.",
        "Hand ranks: straight flush > four of a kind > full house > flush > straight > three of a kind > two pair > pair > high card.",
      ],
      scoring: "Your score is your final chip count.",
      ending: "The game ends after the set number of hands, or when one player has all the chips.",
    },
  },
  settings: ["rounds", "turnSeconds"],
  presets: {
    quick: { rounds: 8, turnSeconds: 25 },
    standard: { rounds: 15, turnSeconds: 30 },
    long: { rounds: 30, turnSeconds: 45 },
  },
  actionSchema: actionSchema as unknown as z.ZodType<Action>,

  setup(players, ctx) {
    const s: HoldemState = {
      players,
      stacks: Object.fromEntries(players.map((p) => [p, START_STACK])),
      dealer: players[players.length - 1]!,
      hand: 0,
      maxHands: Math.max(1, ctx.config.rounds),
      phase: "betting",
      street: 0,
      deck: [],
      holes: {},
      board: [],
      inHand: [],
      folded: [],
      allIn: [],
      bets: {},
      committed: {},
      currentBet: 0,
      minRaise: BASE_BB,
      acted: [],
      toAct: null,
      blinds: { sb: BASE_BB / 2, bb: BASE_BB, sbPlayer: players[0]!, bbPlayer: players[1]! },
      deadline: null,
      shown: {},
      result: null,
      lastAction: null,
      log: [],
    };
    startHand(s, ctx);
    return s;
  },

  validate(s, player, a, ctx) {
    if (a.type === "next") {
      if (s.phase !== "showdown") return "The hand isn't over.";
      return player === ctx.hostId ? null : "Only the host can deal the next hand.";
    }
    if (s.phase !== "betting") return "Wait for the next hand.";
    if (s.toAct !== player) return "It's not your turn.";
    const toCall = s.currentBet - s.bets[player]!;
    switch (a.type) {
      case "fold":
        return null;
      case "check":
        return toCall > 0 ? `You need to call ${toCall} (or fold).` : null;
      case "call":
        return toCall > 0 ? null : "Nothing to call — check instead.";
      case "raise": {
        const max = s.bets[player]! + s.stacks[player]!;
        if (a.to > max) return "You don't have that many chips.";
        if (a.to <= s.currentBet) return "A raise has to be more than the current bet.";
        if (a.to - s.currentBet < s.minRaise && a.to !== max) return `Minimum raise is to ${s.currentBet + s.minRaise}.`;
        return null;
      }
    }
  },

  apply(state, player, a, ctx) {
    const s = structuredClone(state);
    if (a.type === "next") {
      startHand(s, ctx);
      return s;
    }
    const who = nameOf(ctx, player);
    let text = "";
    if (a.type === "fold") {
      s.folded.push(player);
      text = `${who} folds.`;
    } else if (a.type === "check") {
      text = `${who} checks.`;
    } else if (a.type === "call") {
      const paid = put(s, player, s.currentBet - s.bets[player]!);
      text = s.allIn.includes(player) ? `${who} calls ${paid} — ALL IN!` : `${who} calls ${paid}.`;
    } else {
      const raiseBy = a.to - s.currentBet;
      put(s, player, a.to - s.bets[player]!);
      if (raiseBy >= s.minRaise) {
        s.minRaise = raiseBy;
        s.acted = [];
      }
      s.currentBet = Math.max(s.currentBet, s.bets[player]!);
      text = s.allIn.includes(player)
        ? `${who} goes ALL IN (${s.bets[player]})! 🔥`
        : `${who} ${state.currentBet ? "raises" : "bets"} to ${a.to}.`;
    }
    if (!s.acted.includes(player)) s.acted.push(player);
    s.lastAction = { player, text };
    s.log = pushLog(s.log, text);
    settle(s, ctx);
    return s;
  },

  pending: (s) => (s.phase === "betting" && s.toAct ? [s.toAct] : []),
  deadline: (s) => (s.phase === "over" ? null : s.deadline),
  onTimeout(s, ctx) {
    if (s.phase === "showdown") return texasHoldem.apply(s, ctx.hostId, { type: "next" }, ctx);
    if (!s.toAct) return s;
    const p = s.toAct;
    return texasHoldem.apply(s, p, s.currentBet > s.bets[p]! ? { type: "fold" } : { type: "check" }, ctx);
  },

  botAction(s, p, ctx) {
    if (s.phase !== "betting" || s.toAct !== p) return null;
    const toCall = s.currentBet - s.bets[p]!;
    const stack = s.stacks[p]!;
    const pot = s.inHand.reduce((n, x) => n + s.committed[x]!, 0);
    const str = strength(s, p) + (ctx.rng.next() - 0.5) * 0.15;
    const max = s.bets[p]! + stack;
    const raiseTo = (mult: number) =>
      Math.min(max, Math.max(s.currentBet + s.minRaise, Math.round((s.currentBet + pot * mult) / 10) * 10));
    if (str > 0.85 && stack > 0) return { type: "raise", to: raiseTo(1) };
    if (str > 0.68 && ctx.rng.next() < 0.4 && stack > toCall) return { type: "raise", to: raiseTo(0.5) };
    if (toCall === 0) return ctx.rng.next() < 0.08 && stack > 0 ? { type: "raise", to: raiseTo(0.5) } : { type: "check" };
    const priceOk = toCall <= Math.max(s.blinds.bb * 2, (stack + s.bets[p]!) * (str > 0.55 ? 0.5 : 0.12));
    if (str > 0.45 && priceOk) return { type: "call" };
    if (str > 0.3 && toCall <= s.blinds.bb) return { type: "call" };
    return { type: "fold" };
  },

  isOver: (s) => s.phase === "over",
  results: (s, ctx) => {
    const res = resultsFromScores(s.stacks, ctx, { order: s.players });
    return res;
  },
  roundSummaries: () => [],

  publicView(s): HoldemPublic {
    return {
      players: s.players,
      stacks: s.stacks,
      dealer: s.dealer,
      hand: s.hand,
      maxHands: s.maxHands,
      phase: s.phase,
      street: s.street,
      board: s.board,
      inHand: s.inHand,
      folded: s.folded,
      allIn: s.allIn,
      bets: s.bets,
      pot: s.inHand.reduce((n, p) => n + (s.committed[p] ?? 0), 0),
      currentBet: s.currentBet,
      minRaise: s.minRaise,
      toAct: s.toAct,
      blinds: s.blinds,
      shown: s.shown,
      result: s.result,
      lastAction: s.lastAction,
      log: s.log,
    };
  },
  privateView(s, p): HoldemPrivate | null {
    if (!s.players.includes(p)) return null;
    const hole = s.holes[p] ?? [];
    return {
      hand: hole,
      best: hole.length && s.board.length ? bestHand([...hole, ...s.board]).name : null,
    };
  },
};

export interface HoldemPublic {
  players: PlayerId[];
  stacks: Record<PlayerId, number>;
  dealer: PlayerId;
  hand: number;
  maxHands: number;
  phase: HoldemState["phase"];
  street: number;
  board: CardId[];
  inHand: PlayerId[];
  folded: PlayerId[];
  allIn: PlayerId[];
  bets: Record<PlayerId, number>;
  pot: number;
  currentBet: number;
  minRaise: number;
  toAct: PlayerId | null;
  blinds: HoldemState["blinds"];
  shown: Record<PlayerId, CardId[]>;
  result: HoldemState["result"];
  lastAction: HoldemState["lastAction"];
  log: string[];
}
export interface HoldemPrivate {
  hand: CardId[];
  best: string | null;
}
