import { z } from "zod";
import { deadlineFrom, nameOf, nextPlayer, pushLog, resultsFromScores } from "@/lib/engine/helpers";
import type { GameContext, GameModule, PlayerId, ViewContext } from "@/lib/engine/types";
import type { Rng } from "@/lib/engine/rng";
import { autoPlayFor } from "../shared/auto";
import { playerIdSchema } from "../shared/schemas";
import {
  COLORS,
  COLOR_INFO,
  type Color,
  DECK,
  NO_BUILDINGS,
  card,
  colorsOf,
  isAction,
  isPropertyCard,
  money,
  rentFor,
} from "./cards";

export * from "./cards";

export interface Pile {
  color: Color;
  cards: string[];
  house: string | null;
  hotel: string | null;
}

export type RequestKind = "rent" | "debtCollector" | "birthday" | "slyDeal" | "forcedDeal" | "dealBreaker";

export interface RequestTarget {
  player: PlayerId;
  /** Money owed (money requests only). */
  amount: number;
  /** Who must respond next: the target, or the actor after a Just Say No. */
  waiting: "target" | "actor";
  done: boolean;
  outcome: "paid" | "blocked" | "accepted" | null;
  /** Cards handed over (money requests), for the table display. */
  paid: string[];
}

export interface DealRequest {
  kind: RequestKind;
  actor: PlayerId;
  card: string;
  label: string;
  targets: RequestTarget[];
  color: Color | null;
  take: string | null;
  give: string | null;
}

export interface PropertyDealState {
  players: PlayerId[];
  hands: Record<PlayerId, string[]>;
  banks: Record<PlayerId, string[]>;
  props: Record<PlayerId, Pile[]>;
  deck: string[];
  discard: string[];
  turn: PlayerId;
  playsLeft: number;
  turnNo: number;
  request: DealRequest | null;
  deadline: number | null;
  setsToWin: number;
  winner: PlayerId | null;
  over: boolean;
  last: { player: PlayerId; card: string; text: string } | null;
  log: string[];
}

const MAX_HAND = 7;
const PLAYS_PER_TURN = 3;
/** Safety valve so a game between very cautious bots can't run forever. */
const TURN_LIMIT = 400;

const cardIdSchema = z.string().min(1).max(8);
const colorSchema = z.enum(COLORS);

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bank"), card: cardIdSchema }),
  z.object({ type: z.literal("property"), card: cardIdSchema, color: colorSchema }),
  z.object({ type: z.literal("move-wild"), card: cardIdSchema, color: colorSchema }),
  z.object({ type: z.literal("pass-go"), card: cardIdSchema }),
  z.object({ type: z.literal("birthday"), card: cardIdSchema }),
  z.object({ type: z.literal("debt-collector"), card: cardIdSchema, target: playerIdSchema }),
  z.object({
    type: z.literal("rent"),
    card: cardIdSchema,
    color: colorSchema,
    target: playerIdSchema.optional(),
    doubles: z.array(cardIdSchema).max(2).optional(),
  }),
  z.object({ type: z.literal("sly-deal"), card: cardIdSchema, target: playerIdSchema, take: cardIdSchema }),
  z.object({
    type: z.literal("forced-deal"),
    card: cardIdSchema,
    target: playerIdSchema,
    take: cardIdSchema,
    give: cardIdSchema,
  }),
  z.object({ type: z.literal("deal-breaker"), card: cardIdSchema, target: playerIdSchema, color: colorSchema }),
  z.object({ type: z.literal("build"), card: cardIdSchema, color: colorSchema }),
  z.object({ type: z.literal("end-turn"), discard: z.array(cardIdSchema).max(20).optional() }),
  z.object({ type: z.literal("pay"), cards: z.array(cardIdSchema).max(60) }),
  z.object({ type: z.literal("accept"), target: playerIdSchema.optional() }),
  z.object({ type: z.literal("just-say-no"), card: cardIdSchema, target: playerIdSchema.optional() }),
]);
export type PropertyDealAction = z.infer<typeof actionSchema>;
type Action = PropertyDealAction;

const MONEY_REQUESTS: readonly RequestKind[] = ["rent", "debtCollector", "birthday"];
const known = (id: string) => DECK.some((c) => c.id === id);

// ───────────────────────── Table helpers (pure reads) ─────────────────────────

export function pileOf(piles: Pile[], color: Color): Pile | undefined {
  return piles.find((p) => p.color === color);
}

export function isComplete(pile: Pile): boolean {
  return pile.cards.length >= COLOR_INFO[pile.color].size;
}

export function completeColors(piles: Pile[]): Color[] {
  return piles.filter(isComplete).map((p) => p.color);
}

export function rentOf(piles: Pile[], color: Color): number {
  const pile = pileOf(piles, color);
  if (!pile) return 0;
  let rent = rentFor(pile.cards.length, color);
  if (isComplete(pile)) {
    if (pile.house) rent += 3;
    if (pile.hotel) rent += 4;
  }
  return rent;
}

/** Cards a player can hand over as payment: bank, buildings and properties with a value. */
export function payableCards(bank: string[], piles: Pile[]): string[] {
  const out = [...bank];
  for (const p of piles) {
    for (const c of p.cards) if (card(c).value > 0) out.push(c);
    if (p.house) out.push(p.house);
    if (p.hotel) out.push(p.hotel);
  }
  return out;
}

export const valueOf = (ids: string[]) => ids.reduce((n, id) => n + card(id).value, 0);

/** Properties that Sly Deal / Forced Deal may take (not in a full set). */
export function stealable(piles: Pile[]): string[] {
  return piles.filter((p) => !isComplete(p)).flatMap((p) => p.cards);
}

/**
 * The cheapest way to cover `amount`: money from the bank first (smallest
 * overpay), then the least valuable properties.
 */
export function suggestPayment(bank: string[], piles: Pile[], amount: number): string[] {
  const all = payableCards(bank, piles);
  if (valueOf(all) <= amount) return all;
  if (valueOf(bank) >= amount) return bestSubset(bank, amount);
  const chosen = [...bank];
  let total = valueOf(bank);
  const rest = all
    .filter((c) => !bank.includes(c))
    .map((c) => {
      const pile = piles.find((p) => p.cards.includes(c) || p.house === c || p.hotel === c)!;
      // Prefer giving away buildings and cards from sets we're far from finishing.
      const keep = isComplete(pile) ? 10 : pile.cards.length / COLOR_INFO[pile.color].size;
      return { c, v: card(c).value, keep };
    })
    .sort((a, b) => a.keep - b.keep || a.v - b.v);
  for (const r of rest) {
    if (total >= amount) break;
    chosen.push(r.c);
    total += r.v;
  }
  return chosen;
}

/** Subset of money cards with the smallest total that still reaches `amount`. */
function bestSubset(cards: string[], amount: number): string[] {
  const sorted = [...cards].sort((a, b) => card(b).value - card(a).value);
  // best[t] = cards reaching exactly total t
  const best = new Map<number, string[]>([[0, []]]);
  for (const c of sorted) {
    const v = card(c).value;
    for (const [t, set] of [...best.entries()]) {
      if (t >= amount) continue;
      const nt = t + v;
      if (!best.has(nt)) best.set(nt, [...set, c]);
    }
  }
  const totals = [...best.keys()].filter((t) => t >= amount).sort((a, b) => a - b);
  return best.get(totals[0]!) ?? cards;
}

// ───────────────────────── Mutating helpers (on a cloned state) ─────────────────────────

function sortPiles(piles: Pile[]) {
  piles.sort((a, b) => COLORS.indexOf(a.color) - COLORS.indexOf(b.color));
}

function addProperty(s: PropertyDealState, player: PlayerId, id: string, color: Color) {
  const piles = s.props[player]!;
  let pile = pileOf(piles, color);
  if (!pile) {
    pile = { color, cards: [], house: null, hotel: null };
    piles.push(pile);
    sortPiles(piles);
  }
  pile.cards.push(id);
}

/** Take a card off the table (bank, property or building). Returns where it was. */
function takeFromTable(s: PropertyDealState, player: PlayerId, id: string): { color: Color | null } {
  const bank = s.banks[player]!;
  const i = bank.indexOf(id);
  if (i >= 0) {
    bank.splice(i, 1);
    return { color: null };
  }
  for (const pile of s.props[player]!) {
    const j = pile.cards.indexOf(id);
    if (j >= 0) {
      pile.cards.splice(j, 1);
      return { color: pile.color };
    }
    if (pile.house === id) {
      pile.house = null;
      return { color: null };
    }
    if (pile.hotel === id) {
      pile.hotel = null;
      return { color: null };
    }
  }
  throw new Error(`Card ${id} is not on ${player}'s table`);
}

/** Buildings only stay on full sets; empty piles disappear. */
function tidy(s: PropertyDealState, player: PlayerId) {
  const piles = s.props[player]!;
  for (const pile of piles) {
    const canBuild = isComplete(pile) && !NO_BUILDINGS.includes(pile.color);
    if (pile.house && !canBuild) {
      s.banks[player]!.push(pile.house);
      pile.house = null;
    }
    if (pile.hotel && (!canBuild || !pile.house)) {
      s.banks[player]!.push(pile.hotel);
      pile.hotel = null;
    }
  }
  s.props[player] = piles.filter((p) => p.cards.length > 0);
}

function transfer(s: PropertyDealState, from: PlayerId, to: PlayerId, ids: string[]) {
  for (const id of ids) {
    const { color } = takeFromTable(s, from, id);
    if (color && isPropertyCard(id)) addProperty(s, to, id, color);
    else s.banks[to]!.push(id);
  }
  tidy(s, from);
  tidy(s, to);
}

function removeFromHand(s: PropertyDealState, player: PlayerId, id: string) {
  const hand = s.hands[player]!;
  hand.splice(hand.indexOf(id), 1);
}

function draw(s: PropertyDealState, player: PlayerId, n: number, rng: Rng) {
  for (let i = 0; i < n; i++) {
    if (s.deck.length === 0) {
      if (s.discard.length === 0) return;
      s.deck = rng.shuffle(s.discard);
      s.discard = [];
      s.log = pushLog(s.log, "The discard pile was shuffled into a new draw pile.");
    }
    s.hands[player]!.push(s.deck.shift()!);
  }
}

function startTurn(s: PropertyDealState, player: PlayerId, ctx: GameContext) {
  s.turn = player;
  s.turnNo += 1;
  s.playsLeft = PLAYS_PER_TURN;
  draw(s, player, s.hands[player]!.length === 0 ? 5 : 2, ctx.rng);
  s.deadline = deadlineFrom(ctx.now, ctx.config.turnSeconds);
}

function checkWin(s: PropertyDealState) {
  if (s.over) return;
  const order = [s.turn, ...s.players.filter((p) => p !== s.turn)];
  for (const p of order) {
    if (new Set(completeColors(s.props[p]!)).size >= s.setsToWin) {
      s.winner = p;
      s.over = true;
      s.request = null;
      s.deadline = null;
      return;
    }
  }
}

function responseDeadline(ctx: GameContext) {
  return deadlineFrom(ctx.now, Math.max(20, Math.round(ctx.config.turnSeconds * 0.75)));
}

/** Resolve targets who have nothing to decide, then close the request when everyone is done. */
function settleRequest(s: PropertyDealState, ctx: GameContext) {
  const r = s.request;
  if (!r) return;
  if (MONEY_REQUESTS.includes(r.kind)) {
    for (const t of r.targets) {
      if (t.done || t.waiting !== "target") continue;
      const payable = payableCards(s.banks[t.player]!, s.props[t.player]!);
      const hasNo = s.hands[t.player]!.some((c) => isAction(c, "justSayNo"));
      if (payable.length === 0 && !hasNo) {
        t.done = true;
        t.outcome = "paid";
        s.log = pushLog(s.log, `${nameOf(ctx, t.player)} is broke — nothing to pay!`);
      }
    }
  }
  checkWin(s);
  if (s.over) return;
  if (r.targets.every((t) => t.done)) {
    s.request = null;
    s.deadline = deadlineFrom(ctx.now, ctx.config.turnSeconds);
  }
}

function openRequest(
  s: PropertyDealState,
  ctx: GameContext,
  r: Omit<DealRequest, "targets" | "color" | "take" | "give"> &
    Partial<Pick<DealRequest, "color" | "take" | "give">> & { targets: { player: PlayerId; amount: number }[] },
) {
  s.request = {
    color: null,
    take: null,
    give: null,
    ...r,
    targets: r.targets.map((t) => ({ ...t, waiting: "target", done: false, outcome: null, paid: [] })),
  };
  s.deadline = responseDeadline(ctx);
  settleRequest(s, ctx);
}

function executeSteal(s: PropertyDealState, r: DealRequest, target: PlayerId) {
  if (r.kind === "slyDeal") transfer(s, target, r.actor, [r.take!]);
  else if (r.kind === "forcedDeal") {
    transfer(s, target, r.actor, [r.take!]);
    transfer(s, r.actor, target, [r.give!]);
  } else if (r.kind === "dealBreaker") {
    const pile = pileOf(s.props[target]!, r.color!)!;
    const mine = pileOf(s.props[r.actor]!, r.color!);
    const hadHouse = !!mine?.house;
    const hadHotel = !!mine?.hotel;
    s.props[target] = s.props[target]!.filter((p) => p !== pile);
    for (const c of pile.cards) addProperty(s, r.actor, c, r.color!);
    const dest = pileOf(s.props[r.actor]!, r.color!)!;
    if (pile.house) {
      if (hadHouse) s.banks[r.actor]!.push(pile.house);
      else dest.house = pile.house;
    }
    if (pile.hotel) {
      if (hadHotel) s.banks[r.actor]!.push(pile.hotel);
      else dest.hotel = pile.hotel;
    }
    tidy(s, r.actor);
  }
}

function describeSteal(r: DealRequest, ctx: ViewContext, target: PlayerId): string {
  const a = nameOf(ctx, r.actor);
  const t = nameOf(ctx, target);
  if (r.kind === "slyDeal") return `${a} swiped ${card(r.take!).name} from ${t}.`;
  if (r.kind === "forcedDeal") return `${a} swapped ${card(r.give!).name} for ${t}'s ${card(r.take!).name}.`;
  return `${a} stole ${t}'s whole ${COLOR_INFO[r.color!].name} set! 💀`;
}

// ───────────────────────── Validation ─────────────────────────

function turnActionError(s: PropertyDealState, player: PlayerId, a: Action): string | null {
  if (s.request) return "Wait until everyone has responded.";
  if (s.turn !== player) return "It's not your turn.";
  if (a.type === "end-turn") {
    const hand = s.hands[player]!;
    const need = Math.max(0, hand.length - MAX_HAND);
    const discard = a.discard ?? [];
    if (discard.length !== need) {
      return need ? `Discard ${need} card${need === 1 ? "" : "s"} to get down to ${MAX_HAND}.` : "You don't need to discard.";
    }
    if (new Set(discard).size !== discard.length || !discard.every((c) => hand.includes(c)))
      return "Discard cards from your hand.";
    return null;
  }
  if (a.type === "move-wild") {
    if (!known(a.card) || card(a.card).kind !== "wild") return "Only wildcards can be moved.";
    const pile = s.props[player]!.find((p) => p.cards.includes(a.card));
    if (!pile) return "That wildcard isn't on your table.";
    if (pile.color === a.color) return "It's already there.";
    if (!colorsOf(a.card).includes(a.color)) return "That wildcard can't be that colour.";
    return null;
  }

  // Everything else plays a card from the hand.
  if (a.type === "pay" || a.type === "accept" || a.type === "just-say-no") return "Nothing to respond to.";
  if (!known(a.card) || !s.hands[player]!.includes(a.card)) return "That card isn't in your hand.";
  if (s.playsLeft <= 0) return "You've played 3 cards — end your turn.";
  const c = card(a.card);
  const others = s.players.filter((p) => p !== player);
  const targetOk = (t: string | undefined) => !!t && others.includes(t);

  switch (a.type) {
    case "bank":
      if (c.kind === "property" || c.kind === "wild") return "Properties can't go in the bank.";
      return null;
    case "property":
      if (!isPropertyCard(a.card)) return "That's not a property.";
      if (!colorsOf(a.card).includes(a.color)) return "That property can't go there.";
      return null;
    case "pass-go":
      return isAction(a.card, "passGo") ? null : "That's not Pass Go.";
    case "birthday":
      return isAction(a.card, "birthday") ? null : "That's not It's My Birthday.";
    case "debt-collector":
      if (!isAction(a.card, "debtCollector")) return "That's not Debt Collector.";
      return targetOk(a.target) ? null : "Pick another player.";
    case "rent": {
      if (c.kind !== "rent") return "That's not a rent card.";
      if (!c.colors.includes(a.color)) return "That rent card doesn't cover that colour.";
      if (rentOf(s.props[player]!, a.color) <= 0) return `You don't own any ${COLOR_INFO[a.color].name} properties.`;
      if (c.any && !targetOk(a.target)) return "Pick who pays.";
      const doubles = a.doubles ?? [];
      if (new Set(doubles).size !== doubles.length) return "Each Double the Rent card counts once.";
      if (!doubles.every((d) => s.hands[player]!.includes(d) && isAction(d, "doubleRent")))
        return "Those aren't Double the Rent cards.";
      if (s.playsLeft < 1 + doubles.length) return "Not enough plays left for that many cards.";
      return null;
    }
    case "sly-deal":
    case "forced-deal": {
      if (!isAction(a.card, a.type === "sly-deal" ? "slyDeal" : "forcedDeal")) return "Wrong card.";
      if (!targetOk(a.target)) return "Pick another player.";
      if (!stealable(s.props[a.target]!).includes(a.take)) return "You can only take a property that isn't in a full set.";
      if (a.type === "forced-deal" && !stealable(s.props[player]!).includes(a.give))
        return "Give one of your properties that isn't in a full set.";
      return null;
    }
    case "deal-breaker": {
      if (!isAction(a.card, "dealBreaker")) return "That's not Deal Breaker.";
      if (!targetOk(a.target)) return "Pick another player.";
      const pile = pileOf(s.props[a.target]!, a.color);
      return pile && isComplete(pile) ? null : "Deal Breaker only takes a full set.";
    }
    case "build": {
      const kind = c.kind === "action" ? c.action : null;
      if (kind !== "house" && kind !== "hotel") return "That's not a house or hotel.";
      const pile = pileOf(s.props[player]!, a.color);
      if (!pile || !isComplete(pile)) return "Buildings go on a full set.";
      if (NO_BUILDINGS.includes(a.color)) return "No buildings on railroads or utilities.";
      if (kind === "house" && pile.house) return "That set already has a house.";
      if (kind === "hotel" && !pile.house) return "Add a house first.";
      if (kind === "hotel" && pile.hotel) return "That set already has a hotel.";
      return null;
    }
    default:
      return "You can't do that now.";
  }
}

function responseError(s: PropertyDealState, player: PlayerId, a: Action): string | null {
  const r = s.request;
  if (!r) return "There's nothing to respond to.";
  if (player === r.actor) {
    if (a.type !== "accept" && a.type !== "just-say-no") return "You're the one getting paid.";
    const t = r.targets.find((x) => x.player === a.target && !x.done && x.waiting === "actor");
    if (!t) return "Nobody is waiting on you.";
    if (a.type === "just-say-no" && !(s.hands[player]!.includes(a.card) && isAction(a.card, "justSayNo")))
      return "You need a Just Say No card.";
    return null;
  }
  const t = r.targets.find((x) => x.player === player);
  if (!t || t.done) return "You're all set.";
  if (t.waiting !== "target") return "Waiting for them to respond to your Just Say No.";
  if (a.type === "just-say-no") {
    return s.hands[player]!.includes(a.card) && isAction(a.card, "justSayNo") ? null : "You need a Just Say No card.";
  }
  const isMoney = MONEY_REQUESTS.includes(r.kind);
  if (a.type === "accept") return isMoney ? "Choose cards to pay with." : null;
  if (a.type === "pay") {
    if (!isMoney) return "Nothing to pay — accept or say no.";
    const payable = payableCards(s.banks[player]!, s.props[player]!);
    if (new Set(a.cards).size !== a.cards.length || !a.cards.every((c) => payable.includes(c)))
      return "Pay with cards from your bank or properties.";
    const total = valueOf(a.cards);
    if (total < t.amount && a.cards.length < payable.length) return `That's only ${money(total)} — you owe ${money(t.amount)}.`;
    return null;
  }
  return "Respond to the request first.";
}

// ───────────────────────── Bots ─────────────────────────

function richest(s: PropertyDealState, player: PlayerId): PlayerId | null {
  let best: PlayerId | null = null;
  let bestV = 0;
  for (const p of s.players) {
    if (p === player) continue;
    const v = valueOf(payableCards(s.banks[p]!, s.props[p]!));
    if (v > bestV) {
      best = p;
      bestV = v;
    }
  }
  return best;
}

function botTurn(s: PropertyDealState, player: PlayerId, rng: Rng): Action {
  const hand = s.hands[player]!;
  const mine = s.props[player]!;
  const others = s.players.filter((p) => p !== player);
  const endTurn = (): Action => {
    const need = Math.max(0, hand.length - MAX_HAND);
    const discard = [...hand]
      .sort((a, b) => card(a).value - card(b).value || Number(isAction(a, "justSayNo")) - Number(isAction(b, "justSayNo")))
      .slice(0, need);
    return { type: "end-turn", discard };
  };
  if (s.playsLeft <= 0) return endTurn();

  const progress = (color: Color) => {
    const pile = pileOf(mine, color);
    if (!pile) return 0;
    return isComplete(pile) ? -1 : pile.cards.length / COLOR_INFO[color].size;
  };

  // 1. Properties.
  for (const id of hand) {
    const c = card(id);
    if (c.kind === "property") return { type: "property", card: id, color: c.color };
  }
  for (const id of hand) {
    const c = card(id);
    if (c.kind !== "wild") continue;
    const options = c.colors.filter((col) => progress(col) >= 0);
    if (c.colors.length > 2) {
      const target = options.filter((col) => progress(col) > 0).sort((a, b) => progress(b) - progress(a))[0];
      if (target) return { type: "property", card: id, color: target };
      continue;
    }
    const color = [...(options.length ? options : c.colors)].sort((a, b) => progress(b) - progress(a))[0]!;
    return { type: "property", card: id, color };
  }
  // 2. Pass Go early.
  const passGo = hand.find((c) => isAction(c, "passGo"));
  if (passGo && s.playsLeft >= 2) return { type: "pass-go", card: passGo };
  // 3. Deal Breaker.
  const breaker = hand.find((c) => isAction(c, "dealBreaker"));
  if (breaker) {
    for (const t of others) {
      const full = s.props[t]!.find(isComplete);
      if (full) return { type: "deal-breaker", card: breaker, target: t, color: full.color };
    }
  }
  // 4. Buildings.
  for (const id of hand) {
    const c = card(id);
    if (c.kind !== "action" || (c.action !== "house" && c.action !== "hotel")) continue;
    const pile = mine.find(
      (p) => isComplete(p) && !NO_BUILDINGS.includes(p.color) && (c.action === "house" ? !p.house : p.house && !p.hotel),
    );
    if (pile) return { type: "build", card: id, color: pile.color };
  }
  // 5. Sly Deal — prefer colours we're collecting.
  const sly = hand.find((c) => isAction(c, "slyDeal"));
  if (sly) {
    const options = others.flatMap((t) => stealable(s.props[t]!).map((take) => ({ t, take })));
    if (options.length) {
      options.sort((a, b) => {
        const score = (x: { take: string }) =>
          Math.max(...colorsOf(x.take).map((col) => progress(col))) * 10 + card(x.take).value;
        return score(b) - score(a);
      });
      return { type: "sly-deal", card: sly, target: options[0]!.t, take: options[0]!.take };
    }
  }
  // 6. Forced Deal — swap our loneliest property for one that helps.
  const forced = hand.find((c) => isAction(c, "forcedDeal"));
  const myLoose = stealable(mine);
  if (forced && myLoose.length) {
    const give = [...myLoose].sort((a, b) => progress(colorsOf(a)[0]!) - progress(colorsOf(b)[0]!))[0]!;
    const giveColor = mine.find((p) => p.cards.includes(give))!.color;
    for (const t of others) {
      const take = stealable(s.props[t]!).find((c) => colorsOf(c).some((col) => col !== giveColor && progress(col) > 0));
      if (take) return { type: "forced-deal", card: forced, target: t, take, give };
    }
  }
  // 7. Rent.
  const target = richest(s, player);
  if (target) {
    let best: { id: string; color: Color; rent: number; any: boolean } | null = null;
    for (const id of hand) {
      const c = card(id);
      if (c.kind !== "rent") continue;
      for (const col of c.colors) {
        const rent = rentOf(mine, col);
        if (rent > 0 && (!best || rent > best.rent)) best = { id, color: col, rent, any: c.any };
      }
    }
    if (best && best.rent >= 2) {
      const doubles = hand.filter((c) => isAction(c, "doubleRent")).slice(0, Math.min(2, s.playsLeft - 1));
      return {
        type: "rent",
        card: best.id,
        color: best.color,
        ...(best.any ? { target } : {}),
        ...(best.rent >= 3 && doubles.length ? { doubles } : {}),
      };
    }
    // 8. Debt collector / birthday.
    const debt = hand.find((c) => isAction(c, "debtCollector"));
    if (debt) return { type: "debt-collector", card: debt, target };
    const bday = hand.find((c) => isAction(c, "birthday"));
    if (bday) return { type: "birthday", card: bday };
  }
  if (passGo) return { type: "pass-go", card: passGo };
  // 9. Bank money, then spare actions when the bank is thin.
  const cash = hand.filter((c) => card(c).kind === "money").sort((a, b) => card(b).value - card(a).value)[0];
  if (cash) return { type: "bank", card: cash };
  if (valueOf(s.banks[player]!) < 6) {
    const spare = hand
      .filter((c) => {
        const d = card(c);
        return (d.kind === "action" && d.action !== "justSayNo" && d.value > 0) || (d.kind === "rent" && rng.next() < 0.5);
      })
      .sort((a, b) => card(b).value - card(a).value)[0];
    if (spare) return { type: "bank", card: spare };
  }
  return endTurn();
}

function botResponse(s: PropertyDealState, player: PlayerId, rng: Rng): Action | null {
  const r = s.request!;
  const no = s.hands[player]!.find((c) => isAction(c, "justSayNo"));
  if (player === r.actor) {
    const t = r.targets.find((x) => !x.done && x.waiting === "actor");
    if (!t) return null;
    const worth = r.kind === "dealBreaker" || t.amount >= 5;
    if (no && worth) return { type: "just-say-no", card: no, target: t.player };
    return { type: "accept", target: t.player };
  }
  const t = r.targets.find((x) => x.player === player && !x.done && x.waiting === "target");
  if (!t) return null;
  if (MONEY_REQUESTS.includes(r.kind)) {
    const assets = valueOf(payableCards(s.banks[player]!, s.props[player]!));
    if (no && (t.amount >= 5 || t.amount >= assets * 0.5)) return { type: "just-say-no", card: no };
    return { type: "pay", cards: suggestPayment(s.banks[player]!, s.props[player]!, t.amount) };
  }
  if (no && (r.kind === "dealBreaker" || rng.next() < 0.6)) return { type: "just-say-no", card: no };
  return { type: "accept" };
}

// ───────────────────────── Module ─────────────────────────

export const propertyDeal: GameModule<PropertyDealState, Action> = {
  meta: {
    id: "property-deal",
    name: "Property Deal",
    tagline: "Monopoly Deal rules: charge rent, steal sets, just say no.",
    category: "card",
    minPlayers: 2,
    maxPlayers: 5,
    duration: "20–40 min",
    icon: "Building2",
    accent: "mint",
    supportsBots: true,
    rules: {
      goal: "Be the first to collect 3 full property sets in different colours.",
      steps: [
        "Everyone starts with 5 cards. On your turn draw 2 (or 5 if your hand is empty), then play up to 3 cards.",
        "Play properties in front of you, bank money (action and rent cards can be banked as money too), or play actions.",
        "Rent cards charge rent for a colour you own — the more of the set you have, the more it costs. Double the Rent doubles it (and uses a play).",
        "Debt Collector takes $5M from one player; It's My Birthday takes $2M from everyone; Pass Go draws 2.",
        "Sly Deal steals a property, Forced Deal swaps one, and Deal Breaker steals a whole full set (buildings included).",
        "Just Say No cancels an action against you — and can be cancelled by another Just Say No.",
        "Pay from your bank and properties (never your hand). No change is given; if you can't cover it, you hand over everything.",
        "Houses (+$3M) and hotels (+$4M) go on full sets, but not on railroads or utilities. Wildcards can be moved between colours on your turn for free.",
        "End your turn with no more than 7 cards in hand.",
      ],
      scoring:
        "The first player with 3 full sets of different colours wins. Everyone else is ranked by how many full sets they have.",
      ending: "The game ends the moment someone owns the winning sets — even on someone else's turn.",
    },
  },
  settings: ["turnSeconds"],
  houseRules: [
    {
      key: "quickWin",
      label: "Speed deal",
      description: "Only 2 full sets needed to win.",
      default: false,
    },
  ],
  presets: {
    quick: { turnSeconds: 45 },
    standard: { turnSeconds: 60 },
    long: { turnSeconds: 90 },
  },
  actionSchema: actionSchema as unknown as z.ZodType<Action>,

  setup(players, ctx) {
    const deck = ctx.rng.shuffle(DECK.map((c) => c.id));
    const s: PropertyDealState = {
      players,
      hands: Object.fromEntries(players.map((p) => [p, deck.splice(0, 5)])),
      banks: Object.fromEntries(players.map((p) => [p, []])),
      props: Object.fromEntries(players.map((p) => [p, []])),
      deck,
      discard: [],
      turn: players[0]!,
      playsLeft: PLAYS_PER_TURN,
      turnNo: 0,
      request: null,
      deadline: null,
      setsToWin: ctx.config.houseRules.quickWin ? 2 : 3,
      winner: null,
      over: false,
      last: null,
      log: [],
    };
    startTurn(s, players[0]!, ctx);
    return s;
  },

  validate(state, player, action) {
    if (state.over) return "The game is over.";
    if (!state.players.includes(player)) return "You're not in this game.";
    if (action.type === "pay" || action.type === "accept" || action.type === "just-say-no") {
      return responseError(state, player, action);
    }
    return turnActionError(state, player, action);
  },

  apply(state, player, action, ctx) {
    const s = structuredClone(state);
    const who = nameOf(ctx, player);
    const log = (text: string) => (s.log = pushLog(s.log, text));
    const play = (id: string, text: string) => {
      removeFromHand(s, player, id);
      s.playsLeft -= 1;
      s.last = { player, card: id, text };
      log(text);
    };
    const toDiscard = (id: string) => s.discard.push(id);

    switch (action.type) {
      case "bank": {
        play(action.card, `${who} banked ${card(action.card).name} (${money(card(action.card).value)}).`);
        s.banks[player]!.push(action.card);
        break;
      }
      case "property": {
        play(action.card, `${who} played ${card(action.card).name} on ${COLOR_INFO[action.color].name}.`);
        addProperty(s, player, action.card, action.color);
        break;
      }
      case "move-wild": {
        takeFromTable(s, player, action.card);
        addProperty(s, player, action.card, action.color);
        tidy(s, player);
        log(`${who} moved a wildcard to ${COLOR_INFO[action.color].name}.`);
        break;
      }
      case "pass-go": {
        play(action.card, `${who} passed Go and drew 2.`);
        toDiscard(action.card);
        draw(s, player, 2, ctx.rng);
        break;
      }
      case "birthday": {
        play(action.card, `🎂 It's ${who}'s birthday — everyone pays ${money(2)}!`);
        toDiscard(action.card);
        openRequest(s, ctx, {
          kind: "birthday",
          actor: player,
          card: action.card,
          label: `It's my birthday! Pay ${money(2)}`,
          targets: s.players.filter((p) => p !== player).map((p) => ({ player: p, amount: 2 })),
        });
        break;
      }
      case "debt-collector": {
        play(action.card, `${who} sent the Debt Collector after ${nameOf(ctx, action.target)} — ${money(5)}!`);
        toDiscard(action.card);
        openRequest(s, ctx, {
          kind: "debtCollector",
          actor: player,
          card: action.card,
          label: `Debt Collector: pay ${money(5)}`,
          targets: [{ player: action.target, amount: 5 }],
        });
        break;
      }
      case "rent": {
        const doubles = action.doubles ?? [];
        const amount = rentOf(s.props[player]!, action.color) * 2 ** doubles.length;
        const colorName = COLOR_INFO[action.color].name;
        const x = doubles.length ? ` ×${2 ** doubles.length}` : "";
        const rentCard = card(action.card);
        const targets = rentCard.kind === "rent" && rentCard.any ? [action.target!] : s.players.filter((p) => p !== player);
        play(
          action.card,
          `${who} charged ${colorName} rent${x}: ${money(amount)} from ${targets.length > 1 ? "everyone" : nameOf(ctx, targets[0]!)}!`,
        );
        toDiscard(action.card);
        for (const d of doubles) {
          removeFromHand(s, player, d);
          s.playsLeft -= 1;
          toDiscard(d);
        }
        openRequest(s, ctx, {
          kind: "rent",
          actor: player,
          card: action.card,
          label: `${colorName} rent${x}: pay ${money(amount)}`,
          color: action.color,
          targets: targets.map((p) => ({ player: p, amount })),
        });
        break;
      }
      case "sly-deal":
      case "forced-deal":
      case "deal-breaker": {
        const t = nameOf(ctx, action.target);
        const text =
          action.type === "sly-deal"
            ? `${who} is trying to Sly Deal ${t}'s ${card(action.take).name}!`
            : action.type === "forced-deal"
              ? `${who} wants to Forced Deal: their ${card(action.give).name} for ${t}'s ${card(action.take).name}.`
              : `${who} played DEAL BREAKER on ${t}'s ${COLOR_INFO[action.color].name} set!`;
        play(action.card, text);
        toDiscard(action.card);
        openRequest(s, ctx, {
          kind: action.type === "sly-deal" ? "slyDeal" : action.type === "forced-deal" ? "forcedDeal" : "dealBreaker",
          actor: player,
          card: action.card,
          label:
            action.type === "sly-deal"
              ? `Sly Deal: take ${card(action.take).name}`
              : action.type === "forced-deal"
                ? `Forced Deal: ${card(action.give).name} ⇄ ${card(action.take).name}`
                : `Deal Breaker: take the ${COLOR_INFO[action.color].name} set`,
          targets: [{ player: action.target, amount: 0 }],
          take: action.type === "deal-breaker" ? null : action.take,
          give: action.type === "forced-deal" ? action.give : null,
          color: action.type === "deal-breaker" ? action.color : null,
        });
        break;
      }
      case "build": {
        const kind = (card(action.card) as { action: string }).action;
        play(action.card, `${who} built a ${kind} on ${COLOR_INFO[action.color].name}.`);
        const pile = pileOf(s.props[player]!, action.color)!;
        if (kind === "house") pile.house = action.card;
        else pile.hotel = action.card;
        break;
      }
      case "end-turn": {
        for (const d of action.discard ?? []) {
          removeFromHand(s, player, d);
          toDiscard(d);
        }
        if (action.discard?.length) log(`${who} discarded ${action.discard.length}.`);
        if (s.turnNo >= TURN_LIMIT) {
          s.over = true;
          s.deadline = null;
          log("Time's up — the game ends on the table as it stands.");
          return s;
        }
        startTurn(s, nextPlayer(s.players, player), ctx);
        return s;
      }
      case "pay": {
        const r = s.request!;
        const t = r.targets.find((x) => x.player === player)!;
        transfer(s, player, r.actor, action.cards);
        t.done = true;
        t.outcome = "paid";
        t.paid = action.cards;
        const total = valueOf(action.cards);
        log(
          action.cards.length
            ? `${who} paid ${nameOf(ctx, r.actor)} ${money(total)}${total < t.amount ? " (everything they had)" : ""}.`
            : `${who} had nothing to pay.`,
        );
        break;
      }
      case "accept": {
        const r = s.request!;
        if (player === r.actor) {
          const t = r.targets.find((x) => x.player === action.target)!;
          t.done = true;
          t.outcome = "blocked";
          log(`${nameOf(ctx, t.player)}'s Just Say No stands.`);
        } else {
          const t = r.targets.find((x) => x.player === player)!;
          executeSteal(s, r, player);
          t.done = true;
          t.outcome = "accepted";
          log(describeSteal(r, ctx, player));
        }
        break;
      }
      case "just-say-no": {
        const r = s.request!;
        removeFromHand(s, player, action.card);
        toDiscard(action.card);
        if (player === r.actor) {
          const t = r.targets.find((x) => x.player === action.target)!;
          t.waiting = "target";
          log(`${who} said NO to ${nameOf(ctx, t.player)}'s Just Say No! 🙅`);
        } else {
          const t = r.targets.find((x) => x.player === player)!;
          t.waiting = "actor";
          log(`${who} said JUST SAY NO! 🙅`);
        }
        s.last = { player, card: action.card, text: `${who}: Just Say No!` };
        s.deadline = responseDeadline(ctx);
        break;
      }
    }
    settleRequest(s, ctx);
    checkWin(s);
    if (s.over && s.winner) log(`🏆 ${nameOf(ctx, s.winner)} has ${s.setsToWin} full sets and wins!`);
    return s;
  },

  pending(state) {
    if (state.over) return [];
    const r = state.request;
    if (!r) return [state.turn];
    const out = r.targets.filter((t) => !t.done && t.waiting === "target").map((t) => t.player);
    if (r.targets.some((t) => !t.done && t.waiting === "actor")) out.push(r.actor);
    return out;
  },
  deadline: (state) => (state.over ? null : state.deadline),
  onTimeout(state, ctx) {
    if (state.request) {
      const next = autoPlayFor(propertyDeal, state, ctx, propertyDeal.pending(state));
      if (next !== state) return next;
    } else {
      const end = botTurnEnd(state);
      if (!propertyDeal.validate(state, state.turn, end, ctx)) return propertyDeal.apply(state, state.turn, end, ctx);
    }
    return { ...state, deadline: deadlineFrom(ctx.now, 30) };
  },

  botAction(state, player, ctx) {
    if (state.over) return null;
    if (state.request) return botResponse(state, player, ctx.rng);
    if (state.turn !== player) return null;
    return botTurn(state, player, ctx.rng);
  },

  isOver: (state) => state.over,
  results(state, ctx) {
    const scores = Object.fromEntries(state.players.map((p) => [p, new Set(completeColors(state.props[p]!)).size]));
    const res = resultsFromScores(scores, ctx, { order: state.players });
    if (state.winner) res.summary = `${nameOf(ctx, state.winner)} built ${state.setsToWin} full sets and wins!`;
    return res;
  },
  roundSummaries: () => [],

  publicView(state): PropertyDealPublic {
    return {
      players: state.players,
      turn: state.turn,
      playsLeft: state.playsLeft,
      turnNo: state.turnNo,
      handCounts: Object.fromEntries(state.players.map((p) => [p, state.hands[p]!.length])),
      banks: state.banks,
      props: state.props,
      deckCount: state.deck.length,
      discardTop: state.discard[state.discard.length - 1] ?? null,
      discardCount: state.discard.length,
      request: state.request,
      setsToWin: state.setsToWin,
      winner: state.winner,
      over: state.over,
      last: state.last,
      log: state.log,
    };
  },
  privateView(state, player): PropertyDealPrivate | null {
    const hand = state.hands[player];
    if (!hand) return null;
    const order = (id: string) => ["property", "wild", "action", "rent", "money"].indexOf(card(id).kind);
    return { hand: [...hand].sort((a, b) => order(a) - order(b) || card(b).value - card(a).value || a.localeCompare(b)) };
  },
};

function botTurnEnd(state: PropertyDealState): Action {
  const hand = state.hands[state.turn]!;
  const need = Math.max(0, hand.length - MAX_HAND);
  return { type: "end-turn", discard: [...hand].sort((a, b) => card(a).value - card(b).value).slice(0, need) };
}

export interface PropertyDealPublic {
  players: PlayerId[];
  turn: PlayerId;
  playsLeft: number;
  turnNo: number;
  handCounts: Record<PlayerId, number>;
  banks: Record<PlayerId, string[]>;
  props: Record<PlayerId, Pile[]>;
  deckCount: number;
  discardTop: string | null;
  discardCount: number;
  request: DealRequest | null;
  setsToWin: number;
  winner: PlayerId | null;
  over: boolean;
  last: PropertyDealState["last"];
  log: string[];
}
export interface PropertyDealPrivate {
  hand: string[];
}
