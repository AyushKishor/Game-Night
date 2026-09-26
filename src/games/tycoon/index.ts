import { z } from "zod";
import { deadlineFrom, nameOf, pushLog, resultsFromScores } from "@/lib/engine/helpers";
import type { GameContext, GameModule, PlayerId } from "@/lib/engine/types";
import { BOARD, type Buyable, CHANCE, CHEST, type CardOp, GROUP_SPACES, JAIL, isBuyable } from "./board";

export * from "./board";

const START_CASH = 1500;
const GO_SALARY = 200;
const JAIL_FEE = 50;
const HOUSES = 32;
const HOTELS = 12;

export interface Debt {
  from: PlayerId;
  to: PlayerId | null;
  amount: number;
  reason: string;
}
export interface TradeSide {
  spaces: number[];
  cash: number;
}
export interface Trade {
  from: PlayerId;
  to: PlayerId;
  give: TradeSide;
  get: TradeSide;
}

export interface TycoonState {
  players: PlayerId[];
  cash: Record<PlayerId, number>;
  pos: Record<PlayerId, number>;
  owner: Record<number, PlayerId>;
  houses: Record<number, number>;
  mortgaged: number[];
  jailTries: Record<PlayerId, number>;
  inJail: PlayerId[];
  jailCards: Record<PlayerId, number>;
  bankrupt: PlayerId[];
  turn: PlayerId;
  phase: "roll" | "buy" | "auction" | "end" | "over";
  doubles: number;
  again: boolean;
  dice: [number, number] | null;
  chance: number[];
  chest: number[];
  auction: { space: number; bids: Record<PlayerId, number> } | null;
  debts: Debt[];
  trade: Trade | null;
  pot: number;
  /** A trade was already proposed this turn (keeps bots from spamming offers). */
  offered: boolean;
  lastCard: { deck: "chance" | "chest"; text: string } | null;
  round: number;
  maxRounds: number;
  deadline: number | null;
  winner: PlayerId | null;
  log: string[];
}

const space = z.number().int().min(0).max(39);
const side = z.object({ spaces: z.array(space).max(28), cash: z.number().int().min(0).max(1_000_000) });
const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("roll") }),
  z.object({ type: z.literal("pay-jail") }),
  z.object({ type: z.literal("use-jail-card") }),
  z.object({ type: z.literal("buy") }),
  z.object({ type: z.literal("decline") }),
  z.object({ type: z.literal("bid"), amount: z.number().int().min(0).max(1_000_000) }),
  z.object({ type: z.literal("end") }),
  z.object({ type: z.literal("build"), space }),
  z.object({ type: z.literal("sell"), space }),
  z.object({ type: z.literal("mortgage"), space }),
  z.object({ type: z.literal("unmortgage"), space }),
  z.object({ type: z.literal("pay-debt") }),
  z.object({ type: z.literal("bankrupt") }),
  z.object({ type: z.literal("trade-offer"), to: z.string().max(64), give: side, get: side }),
  z.object({ type: z.literal("trade-accept") }),
  z.object({ type: z.literal("trade-decline") }),
]);
export type TycoonAction = z.infer<typeof actionSchema>;
type Action = TycoonAction;

// ───────────────────────── Reads ─────────────────────────

export const active = (s: Pick<TycoonState, "players" | "bankrupt">) => s.players.filter((p) => !s.bankrupt.includes(p));
const buyable = (i: number) => BOARD[i] as Buyable;
export const mortgageValue = (i: number) => buyable(i).price / 2;
export const unmortgageCost = (i: number) => Math.ceil(buyable(i).price * 0.55);

export function ownsGroup(s: Pick<TycoonState, "owner">, p: PlayerId, i: number): boolean {
  const sp = BOARD[i]!;
  return sp.kind === "street" && GROUP_SPACES[sp.group].every((j) => s.owner[j] === p);
}

export function rentFor(s: TycoonState, i: number, diceTotal: number, doubled = false): number {
  const sp = BOARD[i]!;
  const owner = s.owner[i];
  if (!owner || s.mortgaged.includes(i)) return 0;
  if (sp.kind === "street") {
    const h = s.houses[i] ?? 0;
    return h > 0 ? sp.rent[h]! : sp.rent[0]! * (ownsGroup(s, owner, i) ? 2 : 1);
  }
  if (sp.kind === "railroad") {
    const n = BOARD.filter((x) => x.kind === "railroad" && s.owner[x.i] === owner).length;
    return 25 * 2 ** (n - 1) * (doubled ? 2 : 1);
  }
  if (sp.kind === "utility") {
    const n = BOARD.filter((x) => x.kind === "utility" && s.owner[x.i] === owner).length;
    return diceTotal * (doubled || n === 2 ? 10 : 4);
  }
  return 0;
}

export function netWorth(s: TycoonState, p: PlayerId): number {
  if (s.bankrupt.includes(p)) return 0;
  let v = s.cash[p]!;
  for (const [k, o] of Object.entries(s.owner)) {
    if (o !== p) continue;
    const i = Number(k);
    const sp = buyable(i);
    v += s.mortgaged.includes(i) ? sp.price / 2 : sp.price;
    if (sp.kind === "street") v += (s.houses[i] ?? 0) * sp.house;
  }
  return v;
}

/** Cash a player could raise by selling every building and mortgaging everything. */
export function liquidValue(s: TycoonState, p: PlayerId): number {
  let v = s.cash[p]!;
  for (const [k, o] of Object.entries(s.owner)) {
    if (o !== p) continue;
    const i = Number(k);
    const sp = buyable(i);
    if (sp.kind === "street") v += ((s.houses[i] ?? 0) * sp.house) / 2;
    if (!s.mortgaged.includes(i)) v += sp.price / 2;
  }
  return v;
}

function supply(s: TycoonState) {
  let houses = 0;
  let hotels = 0;
  for (const h of Object.values(s.houses)) {
    if (h === 5) hotels++;
    else houses += h;
  }
  return { houses: HOUSES - houses, hotels: HOTELS - hotels };
}

export function buildError(s: TycoonState, p: PlayerId, i: number): string | null {
  const sp = BOARD[i]!;
  if (sp.kind !== "street" || s.owner[i] !== p) return "You can only build on your own streets.";
  if (!ownsGroup(s, p, i)) return "You need the whole colour set first.";
  const group = GROUP_SPACES[sp.group];
  if (group.some((j) => s.mortgaged.includes(j))) return "Pay off the mortgages in this set first.";
  const h = s.houses[i] ?? 0;
  if (h >= 5) return "It already has a hotel.";
  if (h > Math.min(...group.map((j) => s.houses[j] ?? 0))) return "Build evenly across the set.";
  if (s.cash[p]! < sp.house) return `A house costs $${sp.house}.`;
  const left = supply(s);
  if (h === 4 ? left.hotels <= 0 : left.houses <= 0) return "The bank has run out of buildings.";
  return null;
}

export function sellError(s: TycoonState, p: PlayerId, i: number): string | null {
  const sp = BOARD[i]!;
  if (sp.kind !== "street" || s.owner[i] !== p) return "Not your street.";
  const h = s.houses[i] ?? 0;
  if (h === 0) return "No buildings to sell.";
  if (h < Math.max(...GROUP_SPACES[sp.group].map((j) => s.houses[j] ?? 0))) return "Sell evenly across the set.";
  return null;
}

export function mortgageError(s: TycoonState, p: PlayerId, i: number): string | null {
  const sp = BOARD[i]!;
  if (!isBuyable(sp) || s.owner[i] !== p) return "Not your property.";
  if (s.mortgaged.includes(i)) return "Already mortgaged.";
  if (sp.kind === "street" && GROUP_SPACES[sp.group].some((j) => (s.houses[j] ?? 0) > 0))
    return "Sell the buildings in this set first.";
  return null;
}

function tradeError(s: TycoonState, t: Trade): string | null {
  if (t.from === t.to || !active(s).includes(t.to)) return "Trade with another player who's still in.";
  if (!t.give.spaces.length && !t.get.spaces.length && !t.give.cash && !t.get.cash) return "Put something in the deal.";
  const check = (spaces: number[], owner: PlayerId) => {
    for (const i of spaces) {
      const sp = BOARD[i]!;
      if (s.owner[i] !== owner) return "Those properties aren't theirs to trade.";
      if (sp.kind === "street" && GROUP_SPACES[sp.group].some((j) => (s.houses[j] ?? 0) > 0))
        return "Sell the buildings on a set before trading any of it.";
    }
    return null;
  };
  if (new Set([...t.give.spaces, ...t.get.spaces]).size !== t.give.spaces.length + t.get.spaces.length)
    return "Each property once.";
  return (
    check(t.give.spaces, t.from) ??
    check(t.get.spaces, t.to) ??
    (t.give.cash > s.cash[t.from]! ? "You don't have that much cash." : null) ??
    (t.get.cash > s.cash[t.to]! ? "They don't have that much cash." : null)
  );
}

// ───────────────────────── Mutations (on a clone) ─────────────────────────

type Ctx = GameContext;
const log = (s: TycoonState, t: string) => (s.log = pushLog(s.log, t));
const freeParking = (ctx: Ctx) => ctx.config.houseRules.freeParking ?? false;

function charge(s: TycoonState, from: PlayerId, to: PlayerId | null, amount: number, reason: string, ctx: Ctx) {
  if (amount <= 0) return;
  if (s.cash[from]! >= amount && !s.debts.some((d) => d.from === from)) {
    s.cash[from]! -= amount;
    if (to) s.cash[to]! += amount;
    else if (freeParking(ctx)) s.pot += amount;
    return;
  }
  s.debts.push({ from, to, amount, reason });
  log(s, `${nameOf(ctx, from)} owes $${amount} (${reason}) and needs to raise cash!`);
}

function sendToJail(s: TycoonState, p: PlayerId, ctx: Ctx) {
  s.pos[p] = JAIL;
  if (!s.inJail.includes(p)) s.inJail.push(p);
  s.jailTries[p] = 0;
  s.again = false;
  s.doubles = 0;
  log(s, `🚔 ${nameOf(ctx, p)} goes to Jail!`);
}

function moveTo(s: TycoonState, p: PlayerId, to: number, ctx: Ctx, collect = true) {
  if (collect && to < s.pos[p]!) {
    s.cash[p]! += GO_SALARY;
    log(s, `${nameOf(ctx, p)} passed GO: +$${GO_SALARY}.`);
  }
  s.pos[p] = to;
}

function land(s: TycoonState, p: PlayerId, dice: number, ctx: Ctx, doubled = false) {
  const sp = BOARD[s.pos[p]!]!;
  const who = nameOf(ctx, p);
  if (isBuyable(sp)) {
    const owner = s.owner[sp.i];
    if (!owner) {
      s.phase = "buy";
      return;
    }
    if (owner === p) return;
    if (s.mortgaged.includes(sp.i)) {
      log(s, `${who} landed on ${sp.name} — mortgaged, no rent.`);
      return;
    }
    const rent = rentFor(s, sp.i, dice, doubled);
    log(s, `${who} pays $${rent} rent to ${nameOf(ctx, owner)} for ${sp.name}.`);
    charge(s, p, owner, rent, `rent on ${sp.name}`, ctx);
    return;
  }
  switch (sp.kind) {
    case "tax":
      log(s, `${who} pays $${sp.amount} ${sp.name}.`);
      charge(s, p, null, sp.amount, sp.name, ctx);
      return;
    case "goToJail":
      sendToJail(s, p, ctx);
      return;
    case "parking":
      if (freeParking(ctx) && s.pot > 0) {
        log(s, `💰 ${who} scoops the Free Parking jackpot: $${s.pot}!`);
        s.cash[p]! += s.pot;
        s.pot = 0;
      }
      return;
    case "chance":
    case "chest": {
      const deck = sp.kind === "chance" ? s.chance : s.chest;
      const idx = deck.shift()!;
      deck.push(idx);
      const card = (sp.kind === "chance" ? CHANCE : CHEST)[idx]!;
      s.lastCard = { deck: sp.kind, text: card.text };
      log(s, `${sp.kind === "chance" ? "❓" : "🎁"} ${who}: ${card.text}`);
      applyCard(s, p, card.op, dice, ctx);
      return;
    }
  }
}

function applyCard(s: TycoonState, p: PlayerId, op: CardOp, dice: number, ctx: Ctx) {
  switch (op.t) {
    case "money":
      if (op.amount > 0) s.cash[p]! += op.amount;
      else charge(s, p, null, -op.amount, "a card", ctx);
      return;
    case "move":
      moveTo(s, p, op.to, ctx);
      return land(s, p, dice, ctx);
    case "back":
      s.pos[p] = (s.pos[p]! + 40 - op.n) % 40;
      return land(s, p, dice, ctx);
    case "jail":
      return sendToJail(s, p, ctx);
    case "jailFree":
      s.jailCards[p]! += 1;
      return;
    case "nearest": {
      let i = s.pos[p]!;
      do i = (i + 1) % 40;
      while (BOARD[i]!.kind !== op.kind);
      moveTo(s, p, i, ctx);
      return land(s, p, dice, ctx, true);
    }
    case "each":
      for (const o of active(s)) {
        if (o === p) continue;
        if (op.amount > 0) charge(s, o, p, op.amount, "a birthday card", ctx);
        else charge(s, p, o, -op.amount, "a card", ctx);
      }
      return;
    case "repairs": {
      let cost = 0;
      for (const [k, o] of Object.entries(s.owner)) {
        if (o !== p) continue;
        const h = s.houses[Number(k)] ?? 0;
        cost += h === 5 ? op.hotel : h * op.house;
      }
      charge(s, p, null, cost, "repairs", ctx);
      return;
    }
  }
}

/** After a landing (and any purchase), decide whether the player rolls again. */
function afterLanding(s: TycoonState) {
  if (s.phase === "buy" || s.phase === "auction" || s.phase === "over") return;
  s.phase = s.again && !s.inJail.includes(s.turn) ? "roll" : "end";
}

function nextTurn(s: TycoonState, ctx: Ctx) {
  const alive = active(s);
  if (alive.length <= 1) return finish(s, ctx);
  const order = s.players;
  let i = order.indexOf(s.turn);
  for (let k = 0; k < order.length; k++) {
    const ni = (i + 1) % order.length;
    if (ni <= i) s.round += 1;
    i = ni;
    if (!s.bankrupt.includes(order[i]!)) break;
  }
  if (s.round > s.maxRounds) return finish(s, ctx);
  s.turn = order[i]!;
  s.phase = "roll";
  s.doubles = 0;
  s.again = false;
  s.offered = false;
}

function finish(s: TycoonState, ctx: Ctx) {
  s.phase = "over";
  s.deadline = null;
  s.auction = null;
  s.trade = null;
  const alive = active(s);
  s.winner = alive.length === 1 ? alive[0]! : [...alive].sort((a, b) => netWorth(s, b) - netWorth(s, a))[0]!;
  log(
    s,
    alive.length === 1
      ? `🏆 ${nameOf(ctx, s.winner)} owns the town!`
      : `⏰ Time's up! ${nameOf(ctx, s.winner)} is the richest tycoon.`,
  );
}

function goBankrupt(s: TycoonState, p: PlayerId, ctx: Ctx) {
  const debt = s.debts.find((d) => d.from === p);
  const creditor = debt?.to ?? null;
  // Buildings go back to the bank at half price.
  for (const [k, o] of Object.entries(s.owner)) {
    const i = Number(k);
    if (o !== p) continue;
    const sp = buyable(i);
    if (sp.kind === "street" && s.houses[i]) {
      s.cash[p]! += (s.houses[i]! * sp.house) / 2;
      s.houses[i] = 0;
    }
    if (creditor) s.owner[i] = creditor;
    else {
      delete s.owner[i];
      s.mortgaged = s.mortgaged.filter((m) => m !== i);
    }
  }
  if (creditor) {
    s.cash[creditor]! += s.cash[p]!;
    s.jailCards[creditor]! += s.jailCards[p]!;
  }
  s.cash[p] = 0;
  s.jailCards[p] = 0;
  s.bankrupt.push(p);
  s.inJail = s.inJail.filter((x) => x !== p);
  s.debts = s.debts.filter((d) => d.from !== p).map((d) => (d.to === p ? { ...d, to: null } : d));
  if (s.trade && (s.trade.from === p || s.trade.to === p)) s.trade = null;
  if (s.auction) delete s.auction.bids[p];
  log(s, `💀 ${nameOf(ctx, p)} is BANKRUPT${creditor ? ` — everything goes to ${nameOf(ctx, creditor)}` : ""}.`);
}

function resolveAuction(s: TycoonState, ctx: Ctx) {
  const a = s.auction!;
  const order = [...active(s).slice(active(s).indexOf(s.turn)), ...active(s).slice(0, active(s).indexOf(s.turn))];
  let best: PlayerId | null = null;
  for (const p of order) if ((a.bids[p] ?? 0) > 0 && (!best || a.bids[p]! > a.bids[best]!)) best = p;
  const sp = buyable(a.space);
  if (best) {
    s.cash[best]! -= a.bids[best]!;
    s.owner[a.space] = best;
    log(s, `🔨 ${nameOf(ctx, best)} won ${sp.name} at auction for $${a.bids[best]}.`);
  } else log(s, `Nobody bid on ${sp.name}.`);
  s.auction = null;
  s.phase = "end";
  afterLanding(s);
}

function settle(s: TycoonState, ctx: Ctx) {
  if (s.phase === "over") return;
  if (active(s).length <= 1) return finish(s, ctx);
  if (s.phase === "auction" && active(s).every((x) => x in s.auction!.bids)) resolveAuction(s, ctx);
  if (!s.debts.length && s.bankrupt.includes(s.turn)) nextTurn(s, ctx);
}

function timerFor(s: TycoonState, ctx: Ctx): number {
  if (s.debts.length) return Math.max(45, ctx.config.turnSeconds * 2);
  if (s.trade) return 40;
  if (s.phase === "auction") return 20;
  return ctx.config.turnSeconds;
}

// ───────────────────────── Bots ─────────────────────────

function botRaiseCash(s: TycoonState, p: PlayerId): Action {
  const mine = Object.entries(s.owner)
    .filter(([, o]) => o === p)
    .map(([k]) => Number(k));
  const sellable = mine.filter((i) => !sellError(s, p, i)).sort((a, b) => (s.houses[b] ?? 0) - (s.houses[a] ?? 0));
  if (sellable.length) return { type: "sell", space: sellable[0]! };
  const mortgageable = mine
    .filter((i) => !mortgageError(s, p, i))
    .sort((a, b) => Number(ownsGroup(s, p, a)) - Number(ownsGroup(s, p, b)) || buyable(a).price - buyable(b).price);
  if (mortgageable.length) return { type: "mortgage", space: mortgageable[0]! };
  return { type: "bankrupt" };
}

function botManage(s: TycoonState, p: PlayerId): Action | null {
  const mine = Object.entries(s.owner)
    .filter(([, o]) => o === p)
    .map(([k]) => Number(k));
  const reserve = 150 + 30 * s.round;
  const build = mine
    .filter((i) => !buildError(s, p, i) && s.cash[p]! - (BOARD[i] as { house: number }).house >= Math.min(reserve, 400))
    .sort((a, b) => b - a)[0];
  if (build !== undefined) return { type: "build", space: build };
  const unm = mine.find((i) => s.mortgaged.includes(i) && s.cash[p]! - unmortgageCost(i) >= 500);
  if (unm !== undefined) return { type: "unmortgage", space: unm };
  // Offer cash for the last street of a set we nearly own.
  if (!s.offered && s.phase === "roll") {
    for (const group of Object.values(GROUP_SPACES)) {
      const missing = group.filter((j) => s.owner[j] !== p);
      if (missing.length !== 1 || !group.some((j) => s.owner[j] === p)) continue;
      const j = missing[0]!;
      const holder = s.owner[j];
      if (!holder || s.bankrupt.includes(holder) || group.some((k) => (s.houses[k] ?? 0) > 0)) continue;
      const offer = Math.round(((buyable(j).price + 300) * 1.2) / 10) * 10;
      if (s.cash[p]! - offer >= 200)
        return { type: "trade-offer", to: holder, give: { spaces: [], cash: offer }, get: { spaces: [j], cash: 0 } };
    }
  }
  return null;
}

function tradeValue(s: TycoonState, side: TradeSide, receiver: PlayerId) {
  let v = side.cash;
  for (const i of side.spaces) {
    const sp = BOARD[i]!;
    v += buyable(i).price * (s.mortgaged.includes(i) ? 0.5 : 1);
    // Completing a set for the receiver is worth a lot.
    if (sp.kind === "street" && GROUP_SPACES[sp.group].every((j) => s.owner[j] === receiver || side.spaces.includes(j))) v += 300;
  }
  return v;
}

export const tycoon: GameModule<TycoonState, Action> = {
  meta: {
    id: "tycoon",
    name: "Tycoon",
    tagline: "Monopoly rules: buy the town, build hotels, bankrupt your friends.",
    category: "card",
    minPlayers: 2,
    maxPlayers: 6,
    duration: "30–90 min",
    icon: "Landmark",
    accent: "amber",
    supportsBots: true,
    wideTable: true,
    rules: {
      goal: "Be the last player standing — or the richest when time runs out.",
      steps: [
        `Everyone starts with $${START_CASH}. Roll two dice and move; passing GO pays $${GO_SALARY}. Doubles roll again, but three doubles in a row sends you to Jail.`,
        "Land on an unowned property to buy it. If you pass, it goes to a sealed-bid auction where everyone bids from their phone.",
        "Land on someone else's property and pay rent. Owning a full colour set doubles the rent, and houses and hotels make it huge. Stations and utilities pay more the more of them you own.",
        "On your turn you can build houses evenly on full sets (5 houses = hotel), sell buildings back for half, mortgage properties for half their price, and trade with other players.",
        "Chance and Treasure Chest cards can pay you, cost you, move you or throw you in Jail. In Jail: pay $50, use a Get Out of Jail Free card, or try to roll doubles (you pay and leave on the third try).",
        "Can't pay? Sell buildings and mortgage to raise the cash. If you still can't, you're bankrupt and your stuff goes to whoever you owed.",
      ],
      scoring: "Net worth: cash plus property prices (half if mortgaged) plus what you paid for buildings.",
      ending: "The game ends when only one player is left, or after the set number of rounds — then the richest wins.",
    },
  },
  settings: ["rounds", "turnSeconds"],
  houseRules: [
    { key: "auctions", label: "Auctions", description: "Unbought properties go to a sealed-bid auction.", default: true },
    {
      key: "freeParking",
      label: "Free Parking jackpot",
      description: "Taxes and fines pile up in the middle — land on Free Parking to grab them.",
      default: false,
    },
  ],
  presets: {
    quick: { rounds: 10, turnSeconds: 30 },
    standard: { rounds: 20, turnSeconds: 45 },
    long: { rounds: 40, turnSeconds: 60 },
  },
  actionSchema: actionSchema as unknown as z.ZodType<Action>,

  setup(players, ctx) {
    const zero = () => Object.fromEntries(players.map((p) => [p, 0]));
    return {
      players,
      cash: Object.fromEntries(players.map((p) => [p, START_CASH])),
      pos: zero(),
      owner: {},
      houses: {},
      mortgaged: [],
      jailTries: zero(),
      inJail: [],
      jailCards: zero(),
      bankrupt: [],
      turn: players[0]!,
      phase: "roll",
      doubles: 0,
      again: false,
      dice: null,
      chance: ctx.rng.shuffle(CHANCE.map((_, i) => i)),
      chest: ctx.rng.shuffle(CHEST.map((_, i) => i)),
      auction: null,
      debts: [],
      trade: null,
      pot: 0,
      offered: false,
      lastCard: null,
      round: 1,
      maxRounds: Math.max(1, ctx.config.rounds),
      deadline: deadlineFrom(ctx.now, ctx.config.turnSeconds),
      winner: null,
      log: [],
    };
  },

  validate(s, p, a) {
    if (s.phase === "over") return "The game is over.";
    if (s.bankrupt.includes(p) || !s.players.includes(p)) return "You're out of the game.";
    const debtor = s.debts[0]?.from ?? null;
    if (debtor) {
      if (p !== debtor) return "Waiting for someone to settle a debt.";
      if (a.type === "sell") return sellError(s, p, a.space);
      if (a.type === "mortgage") return mortgageError(s, p, a.space);
      if (a.type === "pay-debt")
        return s.cash[p]! >= s.debts[0]!.amount ? null : `You need $${s.debts[0]!.amount}. Sell or mortgage something.`;
      if (a.type === "bankrupt") return s.cash[p]! >= s.debts[0]!.amount ? "You can afford it — pay up." : null;
      return "Settle your debt first.";
    }
    if (s.trade) {
      if (p === s.trade.to && (a.type === "trade-accept" || a.type === "trade-decline"))
        return a.type === "trade-accept" ? tradeError(s, s.trade) : null;
      if (p === s.trade.from && a.type === "trade-decline") return null;
      return "Waiting for a trade answer.";
    }
    if (s.phase === "auction") {
      if (a.type !== "bid") return "There's an auction on.";
      if (!(p in s.auction!.bids) && active(s).includes(p)) {
        return a.amount > s.cash[p]! ? "You can't bid more than your cash." : null;
      }
      return "You've already bid.";
    }
    if (p !== s.turn) return "It's not your turn.";
    switch (a.type) {
      case "roll":
        return s.phase === "roll" ? null : "You've already rolled.";
      case "pay-jail":
        if (s.phase !== "roll" || !s.inJail.includes(p)) return "You're not in Jail.";
        return s.cash[p]! >= JAIL_FEE ? null : "Not enough cash.";
      case "use-jail-card":
        if (s.phase !== "roll" || !s.inJail.includes(p)) return "You're not in Jail.";
        return s.jailCards[p]! > 0 ? null : "You don't have a Get Out of Jail Free card.";
      case "buy":
        if (s.phase !== "buy") return "Nothing to buy.";
        return s.cash[p]! >= buyable(s.pos[p]!).price ? null : "Not enough cash — mortgage something or pass.";
      case "decline":
        return s.phase === "buy" ? null : "Nothing to decline.";
      case "end":
        return s.phase === "end" ? null : s.phase === "roll" ? "Roll first." : "Finish this first.";
      case "build":
        return buildError(s, p, a.space);
      case "sell":
        return sellError(s, p, a.space);
      case "mortgage":
        return mortgageError(s, p, a.space);
      case "unmortgage": {
        if (s.owner[a.space] !== p || !s.mortgaged.includes(a.space)) return "That isn't mortgaged.";
        return s.cash[p]! >= unmortgageCost(a.space) ? null : `You need $${unmortgageCost(a.space)}.`;
      }
      case "trade-offer":
        if (s.phase !== "roll" && s.phase !== "end") return "Trade before you roll or after your move.";
        return tradeError(s, { from: p, to: a.to, give: a.give, get: a.get });
      default:
        return "You can't do that now.";
    }
  },

  apply(state, p, a, ctx) {
    const s = structuredClone(state);
    const who = nameOf(ctx, p);
    switch (a.type) {
      case "roll": {
        const d1 = ctx.rng.int(6) + 1;
        const d2 = ctx.rng.int(6) + 1;
        s.dice = [d1, d2];
        s.lastCard = null;
        const doubles = d1 === d2;
        if (s.inJail.includes(p)) {
          if (doubles) {
            s.inJail = s.inJail.filter((x) => x !== p);
            log(s, `${who} rolled doubles (${d1}+${d2}) and walks out of Jail!`);
          } else {
            s.jailTries[p]! += 1;
            if (s.jailTries[p]! < 3) {
              log(s, `${who} rolled ${d1}+${d2} — still in Jail.`);
              s.phase = "end";
              break;
            }
            log(s, `${who} pays $${JAIL_FEE} after three tries and leaves Jail.`);
            s.inJail = s.inJail.filter((x) => x !== p);
            charge(s, p, null, JAIL_FEE, "Jail fee", ctx);
          }
          s.again = false;
        } else if (doubles) {
          s.doubles += 1;
          if (s.doubles === 3) {
            log(s, `${who} rolled doubles three times — busted for speeding!`);
            sendToJail(s, p, ctx);
            s.phase = "end";
            break;
          }
          s.again = true;
        } else s.again = false;
        const from = s.pos[p]!;
        moveTo(s, p, (from + d1 + d2) % 40, ctx);
        log(s, `🎲 ${who} rolled ${d1}+${d2}${doubles ? " (doubles!)" : ""} → ${BOARD[s.pos[p]!]!.name}.`);
        s.phase = "end";
        land(s, p, d1 + d2, ctx);
        afterLanding(s);
        break;
      }
      case "pay-jail":
      case "use-jail-card":
        if (a.type === "pay-jail") s.cash[p]! -= JAIL_FEE;
        else s.jailCards[p]! -= 1;
        if (a.type === "pay-jail" && freeParking(ctx)) s.pot += JAIL_FEE;
        s.inJail = s.inJail.filter((x) => x !== p);
        log(s, `${who} ${a.type === "pay-jail" ? `paid $${JAIL_FEE}` : "used a Get Out of Jail Free card"} and is free.`);
        break;
      case "buy": {
        const sp = buyable(s.pos[p]!);
        s.cash[p]! -= sp.price;
        s.owner[sp.i] = p;
        log(s, `🏠 ${who} bought ${sp.name} for $${sp.price}.`);
        s.phase = "end";
        afterLanding(s);
        break;
      }
      case "decline": {
        const sp = buyable(s.pos[p]!);
        if (ctx.config.houseRules.auctions ?? true) {
          s.phase = "auction";
          s.auction = { space: sp.i, bids: {} };
          log(s, `${who} passed on ${sp.name} — it's going to auction!`);
        } else {
          s.phase = "end";
          afterLanding(s);
        }
        break;
      }
      case "bid":
        s.auction!.bids[p] = a.amount;
        if (active(s).every((x) => x in s.auction!.bids)) resolveAuction(s, ctx);
        break;
      case "end":
        nextTurn(s, ctx);
        break;
      case "build": {
        const sp = BOARD[a.space] as Extract<Buyable, { kind: "street" }>;
        s.cash[p]! -= sp.house;
        s.houses[a.space] = (s.houses[a.space] ?? 0) + 1;
        log(s, `🔨 ${who} built ${s.houses[a.space] === 5 ? "a HOTEL" : "a house"} on ${sp.name}.`);
        break;
      }
      case "sell": {
        const sp = BOARD[a.space] as Extract<Buyable, { kind: "street" }>;
        s.houses[a.space]! -= 1;
        s.cash[p]! += sp.house / 2;
        log(s, `${who} sold a building on ${sp.name} (+$${sp.house / 2}).`);
        break;
      }
      case "mortgage":
        s.mortgaged.push(a.space);
        s.cash[p]! += mortgageValue(a.space);
        log(s, `${who} mortgaged ${buyable(a.space).name} (+$${mortgageValue(a.space)}).`);
        break;
      case "unmortgage":
        s.mortgaged = s.mortgaged.filter((m) => m !== a.space);
        s.cash[p]! -= unmortgageCost(a.space);
        log(s, `${who} paid off the mortgage on ${buyable(a.space).name}.`);
        break;
      case "pay-debt": {
        const d = s.debts.shift()!;
        s.cash[p]! -= d.amount;
        if (d.to) s.cash[d.to]! += d.amount;
        else if (freeParking(ctx)) s.pot += d.amount;
        log(s, `${who} paid $${d.amount}${d.to ? ` to ${nameOf(ctx, d.to)}` : ""}.`);
        break;
      }
      case "bankrupt":
        goBankrupt(s, p, ctx);
        break;
      case "trade-offer":
        s.trade = { from: p, to: a.to, give: a.give, get: a.get };
        s.offered = true;
        log(s, `🤝 ${who} offered ${nameOf(ctx, a.to)} a trade.`);
        break;
      case "trade-accept": {
        const t = s.trade!;
        for (const i of t.give.spaces) s.owner[i] = t.to;
        for (const i of t.get.spaces) s.owner[i] = t.from;
        s.cash[t.from]! += t.get.cash - t.give.cash;
        s.cash[t.to]! += t.give.cash - t.get.cash;
        s.trade = null;
        log(s, `✅ ${who} accepted ${nameOf(ctx, t.from)}'s trade.`);
        break;
      }
      case "trade-decline": {
        const t = s.trade!;
        s.trade = null;
        log(s, p === t.from ? `${who} withdrew the trade.` : `❌ ${who} turned down ${nameOf(ctx, t.from)}'s trade.`);
        break;
      }
    }
    settle(s, ctx);
    // Fresh timer whenever the thing we're waiting on changes (auctions keep one clock).
    if (s.phase !== "over" && !(a.type === "bid" && s.phase === "auction")) {
      s.deadline = deadlineFrom(ctx.now, timerFor(s, ctx));
    }
    return s;
  },

  pending(s) {
    if (s.phase === "over") return [];
    if (s.debts.length) return [s.debts[0]!.from];
    if (s.trade) return [s.trade.to];
    if (s.phase === "auction") return active(s).filter((p) => !(p in s.auction!.bids));
    return [s.turn];
  },
  deadline: (s) => (s.phase === "over" ? null : s.deadline),

  onTimeout(state, ctx) {
    let s = state;
    if (s.trade) return tycoon.apply(s, s.trade.to, { type: "trade-decline" }, ctx);
    if (s.phase === "auction" && !s.debts.length) {
      for (const p of tycoon.pending(s)) s = tycoon.apply(s, p, { type: "bid", amount: 0 }, ctx);
      return s;
    }
    // Play out the idle player's obligations: pay debts, roll, pass on buying, end the turn.
    const who = tycoon.pending(s)[0];
    for (let guard = 0; who && guard < 80 && s.phase !== "over"; guard++) {
      const pend = tycoon.pending(s);
      if (pend.length !== 1 || pend[0] !== who) break;
      let a: Action;
      if (s.debts.length) a = s.cash[who]! >= s.debts[0]!.amount ? { type: "pay-debt" } : botRaiseCash(s, who);
      else if (s.phase === "roll") a = { type: "roll" };
      else if (s.phase === "buy") a = { type: "decline" };
      else if (s.phase === "end") a = { type: "end" };
      else break;
      if (tycoon.validate(s, who, a, ctx)) break;
      s = tycoon.apply(s, who, a, ctx);
      if (a.type === "end") break;
    }
    return s === state ? { ...s, deadline: deadlineFrom(ctx.now, 15) } : s;
  },

  botAction(s, p, ctx) {
    if (!tycoon.pending(s).includes(p)) return null;
    const cash = s.cash[p]!;
    if (s.debts.length) return cash >= s.debts[0]!.amount ? { type: "pay-debt" } : botRaiseCash(s, p);
    if (s.trade) {
      const t = s.trade;
      const gain = tradeValue(s, t.give, t.to);
      const loss = tradeValue(s, t.get, t.from);
      return gain >= loss * 1.15 ? { type: "trade-accept" } : { type: "trade-decline" };
    }
    if (s.phase === "auction") {
      const sp = buyable(s.auction!.space);
      const wantsSet = sp.kind === "street" && GROUP_SPACES[sp.group].some((j) => s.owner[j] === p);
      const max = Math.min(cash - 100, Math.round(sp.price * (wantsSet ? 1.1 : 0.4 + ctx.rng.next() * 0.5)));
      return { type: "bid", amount: Math.max(0, Math.floor(max / 5) * 5) };
    }
    if (s.phase === "buy") {
      const sp = buyable(s.pos[p]!);
      const completes = sp.kind === "street" && GROUP_SPACES[sp.group].every((j) => j === sp.i || s.owner[j] === p);
      return cash >= sp.price && (cash - sp.price >= 100 || completes) ? { type: "buy" } : { type: "decline" };
    }
    const manage = botManage(s, p);
    if (manage) return manage;
    if (s.phase === "roll") {
      if (s.inJail.includes(p)) {
        if (s.jailCards[p]! > 0) return { type: "use-jail-card" };
        if (cash >= 300 && s.round < 12) return { type: "pay-jail" };
      }
      return { type: "roll" };
    }
    return { type: "end" };
  },

  isOver: (s) => s.phase === "over",
  results(s, ctx) {
    const scores = Object.fromEntries(s.players.map((p) => [p, netWorth(s, p)]));
    const res = resultsFromScores(scores, ctx, { order: s.players });
    if (s.winner) {
      res.summary =
        active(s).length === 1
          ? `${nameOf(ctx, s.winner)} bankrupted everyone and owns the town!`
          : `${nameOf(ctx, s.winner)} is the richest tycoon with $${netWorth(s, s.winner)}.`;
    }
    return res;
  },
  roundSummaries: () => [],

  publicView(s): TycoonPublic {
    const { chance: _c, chest: _h, ...rest } = s;
    void _c;
    void _h;
    return { ...rest, worth: Object.fromEntries(s.players.map((p) => [p, netWorth(s, p)])) };
  },
  privateView(s, p) {
    return s.players.includes(p) ? { me: p } : null;
  },
};

export type TycoonPublic = Omit<TycoonState, "chance" | "chest"> & { worth: Record<PlayerId, number> };
