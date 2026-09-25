import { z } from "zod";
import { REVEAL_SECONDS, deadlineFrom, nameOf, pushLog, resultsFromScores, zeroScores } from "@/lib/engine/helpers";
import type { GameContext, GameModule, PlayerId, RoundSummary } from "@/lib/engine/types";
import type { Rng } from "@/lib/engine/rng";

/** UNO-style 108-card deck. */
export const UNO_COLORS = ["R", "Y", "G", "B"] as const;
export type UnoColor = (typeof UNO_COLORS)[number];
export const UNO_COLOR_NAMES: Record<UnoColor, string> = { R: "Red", Y: "Yellow", G: "Green", B: "Blue" };
export type UnoKind = "num" | "skip" | "reverse" | "draw2" | "wild" | "wild4";
export interface UnoCard {
  id: string;
  color: UnoColor | null;
  kind: UnoKind;
  n: number | null;
}

function buildDeck(): UnoCard[] {
  const out: UnoCard[] = [];
  const add = (color: UnoColor | null, kind: UnoKind, n: number | null = null) =>
    out.push({ id: `u${out.length + 1}`, color, kind, n });
  for (const c of UNO_COLORS) {
    add(c, "num", 0);
    for (let n = 1; n <= 9; n++) {
      add(c, "num", n);
      add(c, "num", n);
    }
    for (const k of ["skip", "reverse", "draw2"] as const) {
      add(c, k);
      add(c, k);
    }
  }
  for (let i = 0; i < 4; i++) add(null, "wild");
  for (let i = 0; i < 4; i++) add(null, "wild4");
  return out;
}
export const UNO_DECK: readonly UnoCard[] = buildDeck();
const BY_ID = new Map(UNO_DECK.map((c) => [c.id, c]));
export const unoCard = (id: string): UnoCard => {
  const c = BY_ID.get(id);
  if (!c) throw new Error(`Unknown card ${id}`);
  return c;
};

export function unoLabel(id: string): string {
  const c = unoCard(id);
  const col = c.color ? `${UNO_COLOR_NAMES[c.color]} ` : "";
  switch (c.kind) {
    case "num":
      return `${col}${c.n}`;
    case "skip":
      return `${col}Skip`;
    case "reverse":
      return `${col}Reverse`;
    case "draw2":
      return `${col}Draw Two`;
    case "wild":
      return "Wild";
    case "wild4":
      return "Wild Draw Four";
  }
}

export function unoPoints(id: string): number {
  const c = unoCard(id);
  if (c.kind === "num") return c.n!;
  if (c.kind === "wild" || c.kind === "wild4") return 50;
  return 20;
}

export interface ColourClashState {
  players: PlayerId[];
  hands: Record<PlayerId, string[]>;
  deck: string[];
  discard: string[];
  color: UnoColor;
  direction: 1 | -1;
  turn: PlayerId;
  phase: "play" | "roundEnd" | "over";
  /** Cards stacked up by +2/+4 that the current player must take (or stack on). */
  pendingDraw: number;
  /** The card drawn this turn, which may be played straight away. */
  drawn: string | null;
  /** Someone who dropped to one card without calling UNO — anyone can catch them. */
  vulnerable: PlayerId | null;
  round: number;
  scores: Record<PlayerId, number>;
  summaries: RoundSummary[];
  deadline: number | null;
  roundWinner: PlayerId | null;
  last: { player: PlayerId; text: string; card: string | null } | null;
  log: string[];
}

const colorSchema = z.enum(UNO_COLORS);
const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("play"), card: z.string().max(6), color: colorSchema.optional(), uno: z.boolean().optional() }),
  z.object({ type: z.literal("draw") }),
  z.object({ type: z.literal("pass") }),
  z.object({ type: z.literal("uno") }),
  z.object({ type: z.literal("catch"), target: z.string().max(64) }),
  z.object({ type: z.literal("next") }),
]);
type Action = z.infer<typeof actionSchema>;

const stacking = (ctx: { config: { houseRules: Record<string, boolean> } }) => ctx.config.houseRules.stacking ?? true;

function nextSeat(s: ColourClashState, from: PlayerId, steps = 1): PlayerId {
  const i = s.players.indexOf(from);
  const n = s.players.length;
  return s.players[(((i + s.direction * steps) % n) + n) % n]!;
}

export function canPlay(s: Pick<ColourClashState, "discard" | "color" | "pendingDraw">, id: string, stack = true): boolean {
  const c = unoCard(id);
  const t = unoCard(s.discard[s.discard.length - 1]!);
  if (s.pendingDraw > 0) {
    if (!stack) return false;
    if (t.kind === "draw2") return c.kind === "draw2" || c.kind === "wild4";
    return c.kind === "wild4";
  }
  if (c.kind === "wild" || c.kind === "wild4") return true;
  if (c.color === s.color) return true;
  if (c.kind === "num") return t.kind === "num" && t.n === c.n;
  return c.kind === t.kind;
}

function draw(s: ColourClashState, player: PlayerId, n: number, rng: Rng): string[] {
  const got: string[] = [];
  for (let i = 0; i < n; i++) {
    if (!s.deck.length) {
      if (s.discard.length <= 1) break;
      const keep = s.discard.pop()!;
      s.deck = rng.shuffle(s.discard);
      s.discard = [keep];
    }
    const c = s.deck.shift()!;
    s.hands[player]!.push(c);
    got.push(c);
  }
  return got;
}

function deal(players: PlayerId[], round: number, ctx: GameContext, prev?: ColourClashState): ColourClashState {
  const deck = ctx.rng.shuffle(UNO_DECK.map((c) => c.id));
  const hands = Object.fromEntries(players.map((p) => [p, deck.splice(0, 7)]));
  const startIdx = deck.findIndex((id) => unoCard(id).kind === "num");
  const start = deck.splice(startIdx, 1)[0]!;
  return {
    players,
    hands,
    deck,
    discard: [start],
    color: unoCard(start).color!,
    direction: 1,
    turn: players[(round - 1) % players.length]!,
    phase: "play",
    pendingDraw: 0,
    drawn: null,
    vulnerable: null,
    round,
    scores: prev?.scores ?? zeroScores(players),
    summaries: prev?.summaries ?? [],
    deadline: deadlineFrom(ctx.now, ctx.config.turnSeconds),
    roundWinner: null,
    last: null,
    log: pushLog(prev?.log ?? [], `Round ${round}: ${unoLabel(start)} starts the pile.`),
  };
}

function advance(s: ColourClashState, ctx: GameContext, skip = 0) {
  s.turn = nextSeat(s, s.turn, 1 + skip);
  s.drawn = null;
  s.deadline = deadlineFrom(ctx.now, ctx.config.turnSeconds);
}

function finishRound(s: ColourClashState, winner: PlayerId, ctx: GameContext) {
  let gained = 0;
  const lines: string[] = [];
  for (const p of s.players) {
    if (p === winner) continue;
    const pts = s.hands[p]!.reduce((n, c) => n + unoPoints(c), 0);
    gained += pts;
    lines.push(`${nameOf(ctx, p)} was left holding ${s.hands[p]!.length} cards (${pts} pts)`);
  }
  s.scores[winner] = (s.scores[winner] ?? 0) + gained;
  const summary: RoundSummary = {
    round: s.round,
    title: `${nameOf(ctx, winner)} went out and scored ${gained}!`,
    lines,
    scores: Object.fromEntries(s.players.map((p) => [p, p === winner ? gained : 0])),
  };
  s.summaries.push(summary);
  const over = s.round >= ctx.config.rounds || s.scores[winner]! >= ctx.config.targetScore;
  s.phase = over ? "over" : "roundEnd";
  s.roundWinner = winner;
  s.deadline = over ? null : deadlineFrom(ctx.now, REVEAL_SECONDS);
  s.log = pushLog(s.log, summary.title);
}

export const colourClash: GameModule<ColourClashState, Action> = {
  meta: {
    id: "colour-clash",
    name: "Colour Clash",
    tagline: "UNO rules: match colours, stack +2s, don't forget to call it.",
    category: "card",
    minPlayers: 2,
    maxPlayers: 10,
    duration: "10–30 min",
    icon: "Palette",
    accent: "coral",
    supportsBots: true,
    rules: {
      goal: "Get rid of all your cards first, then score points for what everyone else is still holding.",
      steps: [
        "Everyone gets 7 cards. Match the top card by colour, number or symbol.",
        "Skip jumps the next player, Reverse flips direction (it acts like Skip with two players), Draw Two makes the next player pick up 2.",
        "Wild picks the colour. Wild Draw Four picks the colour and the next player picks up 4.",
        "Can't (or don't want to) play? Draw one. If it fits, you may play it right away; otherwise your turn ends.",
        "Stacking (house rule, on by default): answer a Draw Two with another Draw Two or a Draw Four, and a Draw Four with a Draw Four — the last person who can't stack takes the lot.",
        "Down to one card? Hit UNO! If someone catches you before you do, you pick up 2.",
      ],
      scoring:
        "Whoever goes out scores the cards left in everyone else's hands: numbers at face value, Skip/Reverse/Draw Two 20, wilds 50.",
      ending: "Highest total after the set number of rounds (or first to the target score) wins. Ties share the win.",
    },
  },
  settings: ["rounds", "targetScore", "turnSeconds"],
  houseRules: [{ key: "stacking", label: "Stacking", description: "Stack +2s and +4s to pass the pain along.", default: true }],
  presets: {
    quick: { rounds: 1, targetScore: 500, turnSeconds: 20 },
    standard: { rounds: 3, targetScore: 500, turnSeconds: 25 },
    long: { rounds: 6, targetScore: 500, turnSeconds: 40 },
  },
  actionSchema: actionSchema as unknown as z.ZodType<Action>,

  setup: (players, ctx) => deal(players, 1, ctx),

  validate(s, player, a, ctx) {
    if (a.type === "next") {
      if (s.phase !== "roundEnd") return "There is no round to continue.";
      return player === ctx.hostId ? null : "Only the host can start the next round.";
    }
    if (s.phase !== "play") return "The round is over.";
    if (a.type === "uno") {
      return s.vulnerable === player ? null : "You can only call UNO when you're down to your last card.";
    }
    if (a.type === "catch") {
      if (a.target === player) return "You can't catch yourself.";
      return s.vulnerable === a.target ? null : "Too late — nobody to catch.";
    }
    if (s.turn !== player) return "It's not your turn.";
    const hand = s.hands[player]!;
    switch (a.type) {
      case "play": {
        if (!hand.includes(a.card)) return "You don't have that card.";
        if (s.drawn && a.card !== s.drawn) return "You can only play the card you just drew.";
        if (!canPlay(s, a.card, stacking(ctx)))
          return s.pendingDraw ? `Stack a draw card or take ${s.pendingDraw}.` : "That card doesn't match.";
        const c = unoCard(a.card);
        if ((c.kind === "wild" || c.kind === "wild4") && !a.color) return "Pick a colour.";
        return null;
      }
      case "draw":
        return s.drawn ? "You've already drawn." : null;
      case "pass":
        return s.drawn ? null : "Draw a card first (or play one).";
    }
    return null;
  },

  apply(state, player, a, ctx) {
    const s = structuredClone(state);
    const who = nameOf(ctx, player);
    const log = (t: string) => (s.log = pushLog(s.log, t));
    if (a.type === "next") return deal(s.players, s.round + 1, ctx, s);
    if (a.type === "uno") {
      if (s.vulnerable === player) s.vulnerable = null;
      s.last = { player, text: `${who}: UNO!`, card: null };
      log(`${who} called UNO!`);
      return s;
    }
    if (a.type === "catch") {
      draw(s, a.target, 2, ctx.rng);
      s.vulnerable = null;
      s.last = { player, text: `${who} caught ${nameOf(ctx, a.target)}! +2`, card: null };
      log(`🚨 ${who} caught ${nameOf(ctx, a.target)} without UNO — pick up 2!`);
      return s;
    }
    // Any real move by someone else closes the window for catching.
    if (s.vulnerable && s.vulnerable !== player) s.vulnerable = null;

    if (a.type === "draw") {
      if (s.pendingDraw > 0) {
        const n = s.pendingDraw;
        draw(s, player, n, ctx.rng);
        s.pendingDraw = 0;
        log(`${who} picked up ${n}. 😬`);
        s.last = { player, text: `${who} picked up ${n}`, card: null };
        advance(s, ctx);
        return s;
      }
      const [got] = draw(s, player, 1, ctx.rng);
      log(`${who} drew a card.`);
      if (got && canPlay(s, got)) s.drawn = got;
      else advance(s, ctx);
      return s;
    }
    if (a.type === "pass") {
      log(`${who} passed.`);
      advance(s, ctx);
      return s;
    }

    // play
    const c = unoCard(a.card);
    s.hands[player] = s.hands[player]!.filter((x) => x !== a.card);
    s.discard.push(a.card);
    s.color = c.color ?? a.color!;
    const label = unoLabel(a.card) + (c.color ? "" : ` → ${UNO_COLOR_NAMES[s.color]}`);
    s.last = { player, text: `${who} played ${label}`, card: a.card };
    log(`${who} played ${label}.`);
    const left = s.hands[player]!.length;
    if (left === 1) {
      if (a.uno) log(`${who} called UNO!`);
      else s.vulnerable = player;
    }
    if (left === 0) {
      // A final draw card still hits the next player.
      if (c.kind === "draw2" || c.kind === "wild4") {
        const victim = nextSeat(s, player);
        draw(s, victim, s.pendingDraw + (c.kind === "draw2" ? 2 : 4), ctx.rng);
        s.pendingDraw = 0;
      }
      finishRound(s, player, ctx);
      return s;
    }
    const twoPlayers = s.players.length === 2;
    switch (c.kind) {
      case "skip":
        advance(s, ctx, 1);
        break;
      case "reverse":
        s.direction = s.direction === 1 ? -1 : 1;
        advance(s, ctx, twoPlayers ? 1 : 0);
        break;
      case "draw2":
      case "wild4": {
        s.pendingDraw += c.kind === "draw2" ? 2 : 4;
        if (stacking(ctx)) advance(s, ctx);
        else {
          const victim = nextSeat(s, player);
          draw(s, victim, s.pendingDraw, ctx.rng);
          log(`${nameOf(ctx, victim)} picks up ${s.pendingDraw} and loses their turn.`);
          s.pendingDraw = 0;
          advance(s, ctx, 1);
        }
        break;
      }
      default:
        advance(s, ctx);
    }
    return s;
  },

  pending: (s) => (s.phase === "play" ? [s.turn] : []),
  deadline: (s) => (s.phase === "over" ? null : s.deadline),
  onTimeout(s, ctx) {
    if (s.phase === "roundEnd") return deal(s.players, s.round + 1, ctx, s);
    let cur = s;
    const who = s.turn;
    for (let i = 0; i < 3 && cur.phase === "play" && cur.turn === who; i++) {
      const a = colourClash.botAction(cur, who, ctx);
      if (!a || colourClash.validate(cur, who, a, ctx)) break;
      cur = colourClash.apply(cur, who, a, ctx);
    }
    return cur;
  },

  botAction(s, player, ctx) {
    if (s.phase !== "play" || s.turn !== player) return null;
    const hand = s.hands[player]!;
    const options = (s.drawn ? [s.drawn] : hand).filter((c) => canPlay(s, c, stacking(ctx)));
    if (!options.length) return s.drawn ? { type: "pass" } : { type: "draw" };
    const counts = (col: UnoColor) => hand.filter((c) => unoCard(c).color === col).length;
    const bestColor = [...UNO_COLORS].sort((a, b) => counts(b) - counts(a))[0]!;
    const weight = (id: string) => {
      const c = unoCard(id);
      if (c.kind === "wild4") return 0;
      if (c.kind === "wild") return 1;
      return 2 + (c.color === bestColor ? 1 : 0) + (c.kind !== "num" ? 1 : 0);
    };
    const pick = [...options].sort((a, b) => weight(b) - weight(a))[0]!;
    const c = unoCard(pick);
    return { type: "play", card: pick, uno: true, ...(c.color ? {} : { color: bestColor }) };
  },

  isOver: (s) => s.phase === "over",
  results: (s, ctx) => resultsFromScores(s.scores, ctx, { order: s.players }),
  roundSummaries: (s) => s.summaries,

  publicView(s): ColourClashPublic {
    return {
      players: s.players,
      handCounts: Object.fromEntries(s.players.map((p) => [p, s.hands[p]!.length])),
      top: s.discard[s.discard.length - 1]!,
      deckCount: s.deck.length,
      color: s.color,
      direction: s.direction,
      turn: s.turn,
      phase: s.phase,
      pendingDraw: s.pendingDraw,
      vulnerable: s.vulnerable,
      round: s.round,
      scores: s.scores,
      roundWinner: s.roundWinner,
      last: s.last,
      log: s.log,
    };
  },
  privateView(s, player, ctx): ColourClashPrivate | null {
    const hand = s.hands[player];
    if (!hand) return null;
    const order = (id: string) => {
      const c = unoCard(id);
      return (
        (c.color ? UNO_COLORS.indexOf(c.color) : 4) * 100 +
        (c.n ?? 20 + ["skip", "reverse", "draw2", "wild", "wild4"].indexOf(c.kind))
      );
    };
    const mine = s.phase === "play" && s.turn === player;
    return {
      hand: [...hand].sort((a, b) => order(a) - order(b)),
      playable: mine ? (s.drawn ? [s.drawn] : hand).filter((c) => canPlay(s, c, stacking(ctx))) : [],
      drawn: mine ? s.drawn : null,
    };
  },
};

export interface ColourClashPublic {
  players: PlayerId[];
  handCounts: Record<PlayerId, number>;
  top: string;
  deckCount: number;
  color: UnoColor;
  direction: 1 | -1;
  turn: PlayerId;
  phase: ColourClashState["phase"];
  pendingDraw: number;
  vulnerable: PlayerId | null;
  round: number;
  scores: Record<PlayerId, number>;
  roundWinner: PlayerId | null;
  last: ColourClashState["last"];
  log: string[];
}
export interface ColourClashPrivate {
  hand: string[];
  playable: string[];
  drawn: string | null;
}
