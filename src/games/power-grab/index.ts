import { z } from "zod";
import { deadlineFrom, nameOf, pushLog, resultsFromScores } from "@/lib/engine/helpers";
import type { GameContext, GameModule, PlayerId } from "@/lib/engine/types";
import type { Rng } from "@/lib/engine/rng";
import { playerIdSchema } from "../shared/schemas";

/** Coup-style bluffing game. */
export const ROLES = ["duke", "assassin", "captain", "ambassador", "contessa"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_INFO: Record<Role, { name: string; emoji: string; power: string; color: string }> = {
  duke: { name: "Duke", emoji: "👑", power: "Tax: take 3 coins. Blocks Foreign Aid.", color: "#8e44ad" },
  assassin: { name: "Assassin", emoji: "🗡️", power: "Pay 3 coins to make someone lose a card.", color: "#2d3436" },
  captain: { name: "Captain", emoji: "⚓", power: "Steal 2 coins. Blocks stealing.", color: "#1f6fe5" },
  ambassador: { name: "Ambassador", emoji: "🕊️", power: "Swap cards with the deck. Blocks stealing.", color: "#2bb24c" },
  contessa: { name: "Contessa", emoji: "💃", power: "Blocks assassination.", color: "#e5383b" },
};

const CARD_ROLES: Record<string, Role> = Object.fromEntries(
  ROLES.flatMap((r, i) => [0, 1, 2].map((j) => [`k${i * 3 + j + 1}`, r])),
);
export const roleOf = (id: string): Role => CARD_ROLES[id]!;

export type ActKind = "income" | "foreignAid" | "coup" | "tax" | "assassinate" | "steal" | "exchange";
export const ACT_INFO: Record<ActKind, { name: string; claim: Role | null; cost: number; targeted: boolean }> = {
  income: { name: "Income", claim: null, cost: 0, targeted: false },
  foreignAid: { name: "Foreign Aid", claim: null, cost: 0, targeted: false },
  coup: { name: "Coup", claim: null, cost: 7, targeted: true },
  tax: { name: "Tax", claim: "duke", cost: 0, targeted: false },
  assassinate: { name: "Assassinate", claim: "assassin", cost: 3, targeted: true },
  steal: { name: "Steal", claim: "captain", cost: 0, targeted: true },
  exchange: { name: "Exchange", claim: "ambassador", cost: 0, targeted: false },
};
export const BLOCKERS: Partial<Record<ActKind, Role[]>> = {
  foreignAid: ["duke"],
  assassinate: ["contessa"],
  steal: ["captain", "ambassador"],
};

type Then = "continue" | "resolve" | "endTurn" | "blocked";
export type Stage =
  | { k: "action" }
  | { k: "challenge"; claimant: PlayerId; role: Role; forBlock: boolean; passed: PlayerId[] }
  | { k: "block"; passed: PlayerId[] }
  | { k: "lose"; player: PlayerId; then: Then; reason: string }
  | { k: "exchange"; options: string[] };

export interface PowerGrabState {
  players: PlayerId[];
  cards: Record<PlayerId, { id: string; lost: boolean }[]>;
  deck: string[];
  coins: Record<PlayerId, number>;
  turn: PlayerId;
  act: { kind: ActKind; actor: PlayerId; target: PlayerId | null; blocker: PlayerId | null; blockRole: Role | null } | null;
  stage: Stage;
  deadline: number | null;
  eliminated: PlayerId[];
  winner: PlayerId | null;
  over: boolean;
  reveal: { player: PlayerId; role: Role; proved: boolean } | null;
  log: string[];
}

const roleSchema = z.enum(ROLES);
const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("act"),
    kind: z.enum(Object.keys(ACT_INFO) as [ActKind, ...ActKind[]]),
    target: playerIdSchema.optional(),
  }),
  z.object({ type: z.literal("challenge") }),
  z.object({ type: z.literal("allow") }),
  z.object({ type: z.literal("block"), role: roleSchema }),
  z.object({ type: z.literal("lose"), card: z.string().max(4) }),
  z.object({ type: z.literal("keep"), cards: z.array(z.string().max(4)).max(2) }),
]);
type Action = z.infer<typeof actionSchema>;

export const alive = (s: Pick<PowerGrabState, "cards">, p: PlayerId) => s.cards[p]!.some((c) => !c.lost);
const liveCards = (s: PowerGrabState, p: PlayerId) => s.cards[p]!.filter((c) => !c.lost);
const hasRole = (s: PowerGrabState, p: PlayerId, r: Role) => liveCards(s, p).some((c) => roleOf(c.id) === r);

function windowSeconds(ctx: GameContext) {
  return Math.max(10, Math.round(ctx.config.turnSeconds / 2));
}

/** Who may respond in the current challenge/block window. */
export function eligible(s: PowerGrabState): PlayerId[] {
  const st = s.stage;
  if (st.k === "challenge") return s.players.filter((p) => p !== st.claimant && alive(s, p) && !st.passed.includes(p));
  if (st.k === "block") {
    const a = s.act!;
    const who =
      a.kind === "foreignAid"
        ? s.players.filter((p) => p !== a.actor && alive(s, p))
        : a.target && alive(s, a.target)
          ? [a.target]
          : [];
    return who.filter((p) => !st.passed.includes(p));
  }
  return [];
}

function endTurn(s: PowerGrabState, ctx: GameContext) {
  s.act = null;
  if (s.over) return;
  const n = s.players.length;
  let i = s.players.indexOf(s.turn);
  for (let k = 0; k < n; k++) {
    i = (i + 1) % n;
    if (alive(s, s.players[i]!)) break;
  }
  s.turn = s.players[i]!;
  s.stage = { k: "action" };
  s.deadline = deadlineFrom(ctx.now, ctx.config.turnSeconds);
}

function checkWinner(s: PowerGrabState) {
  const left = s.players.filter((p) => alive(s, p));
  if (left.length === 1) {
    s.winner = left[0]!;
    s.over = true;
    s.deadline = null;
    s.stage = { k: "action" };
  }
}

function proceed(s: PowerGrabState, then: Then, ctx: GameContext) {
  if (s.over) return;
  if (then === "continue") afterClaimOk(s, ctx);
  else if (then === "resolve") resolve(s, ctx);
  else {
    if (then === "blocked") s.log = pushLog(s.log, `${nameOf(ctx, s.act!.actor)}'s ${ACT_INFO[s.act!.kind].name} was blocked.`);
    endTurn(s, ctx);
  }
}

function loseCard(s: PowerGrabState, p: PlayerId, id: string, ctx: GameContext) {
  const c = s.cards[p]!.find((x) => x.id === id)!;
  c.lost = true;
  s.log = pushLog(s.log, `${nameOf(ctx, p)} lost their ${ROLE_INFO[roleOf(id)].name} ${ROLE_INFO[roleOf(id)].emoji}.`);
  if (!alive(s, p)) {
    s.eliminated.push(p);
    s.log = pushLog(s.log, `💀 ${nameOf(ctx, p)} is out!`);
  }
  checkWinner(s);
}

function startLose(s: PowerGrabState, p: PlayerId, then: Then, reason: string, ctx: GameContext) {
  const live = liveCards(s, p);
  if (live.length === 0) return proceed(s, then, ctx);
  if (live.length === 1) {
    loseCard(s, p, live[0]!.id, ctx);
    return proceed(s, then, ctx);
  }
  s.stage = { k: "lose", player: p, then, reason };
  s.deadline = deadlineFrom(ctx.now, windowSeconds(ctx));
}

function afterClaimOk(s: PowerGrabState, ctx: GameContext) {
  const a = s.act!;
  if (BLOCKERS[a.kind] && (a.kind === "foreignAid" || (a.target && alive(s, a.target)))) {
    s.stage = { k: "block", passed: [] };
    s.deadline = deadlineFrom(ctx.now, windowSeconds(ctx));
    if (eligible(s).length === 0) resolve(s, ctx);
    return;
  }
  resolve(s, ctx);
}

function resolve(s: PowerGrabState, ctx: GameContext) {
  const a = s.act!;
  const who = nameOf(ctx, a.actor);
  const log = (t: string) => (s.log = pushLog(s.log, t));
  switch (a.kind) {
    case "income":
      s.coins[a.actor]! += 1;
      break;
    case "foreignAid":
      s.coins[a.actor]! += 2;
      log(`${who} took Foreign Aid (+2).`);
      break;
    case "tax":
      s.coins[a.actor]! += 3;
      log(`${who} collected Tax (+3).`);
      break;
    case "steal": {
      const n = Math.min(2, s.coins[a.target!]!);
      s.coins[a.target!]! -= n;
      s.coins[a.actor]! += n;
      log(`${who} stole ${n} from ${nameOf(ctx, a.target!)}.`);
      break;
    }
    case "assassinate":
    case "coup":
      if (a.target && alive(s, a.target)) {
        return startLose(s, a.target, "endTurn", a.kind === "coup" ? "You've been couped" : "You've been assassinated", ctx);
      }
      break;
    case "exchange": {
      const drawn = s.deck.splice(0, 2);
      s.stage = { k: "exchange", options: [...liveCards(s, a.actor).map((c) => c.id), ...drawn] };
      s.deadline = deadlineFrom(ctx.now, ctx.config.turnSeconds);
      return;
    }
  }
  endTurn(s, ctx);
}

function swapProvenCard(s: PowerGrabState, p: PlayerId, role: Role, rng: Rng) {
  const c = liveCards(s, p).find((x) => roleOf(x.id) === role)!;
  s.deck = rng.shuffle([...s.deck, c.id]);
  c.id = s.deck.shift()!;
}

const PREFERENCE: Role[] = ["duke", "captain", "assassin", "contessa", "ambassador"];

export const powerGrab: GameModule<PowerGrabState, Action> = {
  meta: {
    id: "power-grab",
    name: "Power Grab",
    tagline: "Coup rules: lie about who you are, take the money, stab your friends.",
    category: "card",
    minPlayers: 2,
    maxPlayers: 6,
    duration: "10–15 min",
    icon: "Swords",
    accent: "violet",
    supportsBots: true,
    rules: {
      goal: "Be the last player with a secret card (influence) left.",
      steps: [
        "You get 2 secret character cards and 2 coins. Lose both cards and you're out.",
        "On your turn take one action. Income (+1), Foreign Aid (+2) and Coup (pay 7, someone loses a card — can't be stopped) need no character.",
        "Character actions — you can claim ANY character, true or not: Duke = Tax (+3). Assassin = pay 3, someone loses a card. Captain = steal 2 coins. Ambassador = draw 2 cards, keep the best, return 2.",
        "Blocks: Duke blocks Foreign Aid. Contessa blocks an assassination. Captain or Ambassador block stealing.",
        "Anyone can challenge a claim. If the claim was a lie, the liar loses a card. If it was true, the challenger loses a card and the claimant swaps the shown card for a new one.",
        "With 10 or more coins you must Coup.",
      ],
      scoring: "Last one standing wins; everyone else is ranked by how long they survived.",
      ending: "The game ends when only one player has influence left.",
    },
  },
  settings: ["turnSeconds"],
  presets: {
    quick: { turnSeconds: 30 },
    standard: { turnSeconds: 45 },
    long: { turnSeconds: 60 },
  },
  actionSchema: actionSchema as unknown as z.ZodType<Action>,

  setup(players, ctx) {
    const deck = ctx.rng.shuffle(Object.keys(CARD_ROLES));
    return {
      players,
      cards: Object.fromEntries(players.map((p) => [p, deck.splice(0, 2).map((id) => ({ id, lost: false }))])),
      deck,
      coins: Object.fromEntries(players.map((p) => [p, players.length === 2 ? 1 : 2])),
      turn: players[0]!,
      act: null,
      stage: { k: "action" },
      deadline: deadlineFrom(ctx.now, ctx.config.turnSeconds),
      eliminated: [],
      winner: null,
      over: false,
      reveal: null,
      log: [],
    };
  },

  validate(s, player, a) {
    if (s.over) return "The game is over.";
    if (!alive(s, player)) return "You're out — enjoy the show.";
    const st = s.stage;
    switch (a.type) {
      case "act": {
        if (st.k !== "action" || s.turn !== player) return "It's not your turn.";
        const info = ACT_INFO[a.kind];
        if (s.coins[player]! >= 10 && a.kind !== "coup") return "You have 10+ coins — you must Coup.";
        if (s.coins[player]! < info.cost) return `You need ${info.cost} coins.`;
        if (info.targeted) {
          if (!a.target || a.target === player || !s.players.includes(a.target) || !alive(s, a.target))
            return "Pick a player who's still in.";
        }
        if (a.kind === "exchange" && s.deck.length < 2) return "The deck is too small to exchange.";
        return null;
      }
      case "challenge":
      case "allow":
        if (st.k !== "challenge" && st.k !== "block") return "Nothing to respond to.";
        if (!eligible(s).includes(player)) return "You can't respond to this.";
        if (a.type === "challenge" && st.k !== "challenge") return "There's no claim to challenge yet.";
        return null;
      case "block": {
        if (st.k !== "block" || !eligible(s).includes(player)) return "You can't block this.";
        return BLOCKERS[s.act!.kind]!.includes(a.role) ? null : "That character can't block this.";
      }
      case "lose":
        if (st.k !== "lose" || st.player !== player) return "You don't have to lose a card.";
        return liveCards(s, player).some((c) => c.id === a.card) ? null : "Pick one of your face-down cards.";
      case "keep": {
        if (st.k !== "exchange" || s.act?.actor !== player) return "You're not exchanging.";
        const need = liveCards(s, player).length;
        if (a.cards.length !== need) return `Keep exactly ${need}.`;
        if (new Set(a.cards).size !== need || !a.cards.every((c) => st.options.includes(c)))
          return "Keep cards from your options.";
        return null;
      }
    }
  },

  apply(state, player, a, ctx) {
    const s = structuredClone(state);
    const who = nameOf(ctx, player);
    const log = (t: string) => (s.log = pushLog(s.log, t));
    switch (a.type) {
      case "act": {
        const info = ACT_INFO[a.kind];
        s.reveal = null;
        s.coins[player]! -= info.cost;
        s.act = { kind: a.kind, actor: player, target: a.target ?? null, blocker: null, blockRole: null };
        const t = a.target ? ` on ${nameOf(ctx, a.target)}` : "";
        if (a.kind === "income") {
          log(`${who} took Income (+1).`);
          resolve(s, ctx);
        } else if (a.kind === "coup") {
          log(`💥 ${who} launched a COUP${t}!`);
          resolve(s, ctx);
        } else if (a.kind === "foreignAid") {
          log(`${who} wants Foreign Aid (+2). Any Dukes?`);
          afterClaimOk(s, ctx);
        } else {
          log(`${who} claims ${ROLE_INFO[info.claim!].name}: ${info.name}${t}.`);
          s.stage = { k: "challenge", claimant: player, role: info.claim!, forBlock: false, passed: [] };
          s.deadline = deadlineFrom(ctx.now, windowSeconds(ctx));
        }
        break;
      }
      case "allow": {
        const st = s.stage as Extract<Stage, { k: "challenge" | "block" }>;
        st.passed.push(player);
        if (eligible(s).length === 0) {
          if (st.k === "block") resolve(s, ctx);
          else if (st.forBlock) proceed(s, "blocked", ctx);
          else afterClaimOk(s, ctx);
        }
        break;
      }
      case "block": {
        s.act!.blocker = player;
        s.act!.blockRole = a.role;
        log(`🛡️ ${who} blocks with ${ROLE_INFO[a.role].name}!`);
        s.stage = { k: "challenge", claimant: player, role: a.role, forBlock: true, passed: [] };
        s.deadline = deadlineFrom(ctx.now, windowSeconds(ctx));
        break;
      }
      case "challenge": {
        const st = s.stage as Extract<Stage, { k: "challenge" }>;
        const claimant = st.claimant;
        const honest = hasRole(s, claimant, st.role);
        s.reveal = { player: claimant, role: st.role, proved: honest };
        if (honest) {
          log(`${who} challenged ${nameOf(ctx, claimant)}… who really has the ${ROLE_INFO[st.role].name}! ${who} loses a card.`);
          swapProvenCard(s, claimant, st.role, ctx.rng);
          startLose(s, player, st.forBlock ? "blocked" : "continue", "Your challenge failed", ctx);
        } else {
          log(`${who} challenged ${nameOf(ctx, claimant)} — caught lying about the ${ROLE_INFO[st.role].name}! 🤥`);
          if (!st.forBlock) s.coins[claimant]! += ACT_INFO[s.act!.kind].cost; // failed action is refunded
          startLose(s, claimant, st.forBlock ? "resolve" : "endTurn", "You were caught bluffing", ctx);
        }
        break;
      }
      case "lose": {
        const st = s.stage as Extract<Stage, { k: "lose" }>;
        loseCard(s, player, a.card, ctx);
        proceed(s, st.then, ctx);
        break;
      }
      case "keep": {
        const st = s.stage as Extract<Stage, { k: "exchange" }>;
        const live = liveCards(s, player);
        live.forEach((c, i) => (c.id = a.cards[i]!));
        s.deck = ctx.rng.shuffle([...s.deck, ...st.options.filter((c) => !a.cards.includes(c))]);
        log(`${who} exchanged cards with the deck.`);
        endTurn(s, ctx);
        break;
      }
    }
    return s;
  },

  pending(s) {
    if (s.over) return [];
    const st = s.stage;
    if (st.k === "action") return [s.turn];
    if (st.k === "lose") return [st.player];
    if (st.k === "exchange") return [s.act!.actor];
    return eligible(s);
  },
  deadline: (s) => (s.over ? null : s.deadline),
  onTimeout(s, ctx) {
    let cur = s;
    const st = s.stage;
    if (st.k === "challenge" || st.k === "block") {
      for (const p of eligible(s)) cur = powerGrab.apply(cur, p, { type: "allow" }, ctx);
      return cur;
    }
    for (const p of powerGrab.pending(s)) {
      const a: Action | null =
        st.k === "action"
          ? s.coins[p]! >= 10
            ? { type: "act", kind: "coup", target: s.players.find((x) => x !== p && alive(s, x))! }
            : { type: "act", kind: "income" }
          : powerGrab.botAction(cur, p, ctx);
      if (a && !powerGrab.validate(cur, p, a, ctx)) cur = powerGrab.apply(cur, p, a, ctx);
    }
    return cur;
  },

  botAction(s, p, ctx) {
    if (s.over || !powerGrab.pending(s).includes(p)) return null;
    const rng = ctx.rng;
    const st = s.stage;
    const mine = liveCards(s, p).map((c) => roleOf(c.id));
    const others = s.players.filter((x) => x !== p && alive(s, x));
    const threat = [...others].sort(
      (a, b) => liveCards(s, b).length * 10 + s.coins[b]! - (liveCards(s, a).length * 10 + s.coins[a]!),
    )[0]!;
    if (st.k === "action") {
      const coins = s.coins[p]!;
      if (coins >= 7) return { type: "act", kind: "coup", target: threat };
      if (mine.includes("assassin") && coins >= 3) return { type: "act", kind: "assassinate", target: threat };
      if (mine.includes("duke") || rng.next() < 0.2) return { type: "act", kind: "tax" };
      const rich = others.filter((x) => s.coins[x]! >= 2).sort((a, b) => s.coins[b]! - s.coins[a]!)[0];
      if (rich && (mine.includes("captain") || rng.next() < 0.1)) return { type: "act", kind: "steal", target: rich };
      if (mine.includes("ambassador") && rng.next() < 0.4 && s.deck.length >= 2) return { type: "act", kind: "exchange" };
      return rng.next() < 0.5 ? { type: "act", kind: "foreignAid" } : { type: "act", kind: "income" };
    }
    if (st.k === "challenge") {
      const held = mine.filter((r) => r === st.role).length;
      const affectsMe = s.act?.target === p || (st.forBlock && s.act?.actor === p);
      const chance = held >= 2 ? 0.8 : (held === 1 ? 0.2 : 0.07) + (affectsMe ? 0.15 : 0);
      return rng.next() < chance ? { type: "challenge" } : { type: "allow" };
    }
    if (st.k === "block") {
      const roles = BLOCKERS[s.act!.kind]!;
      const real = roles.find((r) => mine.includes(r));
      if (real) return { type: "block", role: real };
      const desperate = s.act!.kind === "assassinate" && mine.length === 1;
      if (rng.next() < (desperate ? 0.5 : 0.12)) return { type: "block", role: roles[0]! };
      return { type: "allow" };
    }
    if (st.k === "lose") {
      const live = liveCards(s, p).sort((a, b) => PREFERENCE.indexOf(roleOf(b.id)) - PREFERENCE.indexOf(roleOf(a.id)));
      return { type: "lose", card: live[0]!.id };
    }
    const need = liveCards(s, p).length;
    const keep = [...st.options].sort((a, b) => PREFERENCE.indexOf(roleOf(a)) - PREFERENCE.indexOf(roleOf(b))).slice(0, need);
    return { type: "keep", cards: keep };
  },

  isOver: (s) => s.over,
  results(s, ctx) {
    const scores = Object.fromEntries(
      s.players.map((p) => [
        p,
        s.winner === p ? s.players.length : s.eliminated.includes(p) ? s.eliminated.indexOf(p) + 1 : s.players.length - 1,
      ]),
    );
    const res = resultsFromScores(scores, ctx, { order: s.players });
    if (s.winner) res.summary = `${nameOf(ctx, s.winner)} is the last one standing!`;
    return res;
  },
  roundSummaries: () => [],

  publicView(s): PowerGrabPublic {
    return {
      players: s.players,
      coins: s.coins,
      influence: Object.fromEntries(s.players.map((p) => [p, liveCards(s, p).length])),
      lost: Object.fromEntries(s.players.map((p) => [p, s.cards[p]!.filter((c) => c.lost).map((c) => roleOf(c.id))])),
      turn: s.turn,
      act: s.act,
      stage:
        s.stage.k === "exchange"
          ? { k: "exchange" }
          : s.stage.k === "lose"
            ? { k: "lose", player: s.stage.player, reason: s.stage.reason }
            : s.stage.k === "challenge"
              ? { k: "challenge", claimant: s.stage.claimant, role: s.stage.role, forBlock: s.stage.forBlock }
              : { k: s.stage.k },
      responders: eligible(s),
      winner: s.winner,
      over: s.over,
      reveal: s.reveal,
      deckCount: s.deck.length,
      log: s.log,
    };
  },
  privateView(s, p): PowerGrabPrivate | null {
    const cards = s.cards[p];
    if (!cards) return null;
    return {
      cards: cards.map((c) => ({ id: c.id, role: roleOf(c.id), lost: c.lost })),
      options: s.stage.k === "exchange" && s.act?.actor === p ? s.stage.options.map((id) => ({ id, role: roleOf(id) })) : null,
    };
  },
};

export interface PowerGrabPublic {
  players: PlayerId[];
  coins: Record<PlayerId, number>;
  influence: Record<PlayerId, number>;
  lost: Record<PlayerId, Role[]>;
  turn: PlayerId;
  act: PowerGrabState["act"];
  stage:
    | { k: "action" | "block" | "exchange" }
    | { k: "lose"; player: PlayerId; reason: string }
    | { k: "challenge"; claimant: PlayerId; role: Role; forBlock: boolean };
  responders: PlayerId[];
  winner: PlayerId | null;
  over: boolean;
  reveal: PowerGrabState["reveal"];
  deckCount: number;
  log: string[];
}
export interface PowerGrabPrivate {
  cards: { id: string; role: Role; lost: boolean }[];
  options: { id: string; role: Role }[] | null;
}
