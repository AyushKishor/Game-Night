import { z } from "zod";
import { type CardId, cardLabel, rankOf, recycleDiscards, shuffledDeck } from "@/lib/engine/cards";
import { REVEAL_SECONDS, deadlineFrom, nameOf, nextPlayer, pushLog, resultsFromScores, zeroScores } from "@/lib/engine/helpers";
import type { GameContext, GameModule, PlayerId, RoundSummary } from "@/lib/engine/types";
import { autoPlayFor, autoPlayPending } from "../shared/auto";

/** Six-card Golf. Grid positions 0-2 are the top row, 3-5 the bottom row; columns are (0,3), (1,4), (2,5). */
export interface GolfState {
  players: PlayerId[];
  grids: Record<PlayerId, CardId[]>;
  up: Record<PlayerId, boolean[]>;
  deck: CardId[];
  discard: CardId[];
  phase: "reveal" | "play" | "roundEnd" | "over";
  turn: PlayerId;
  holding: { card: CardId; from: "deck" | "discard" } | null;
  /** Set when someone has turned all their cards up: everyone else gets one more turn. */
  closer: PlayerId | null;
  finalTurnsLeft: number;
  round: number;
  scores: Record<PlayerId, number>;
  summaries: RoundSummary[];
  deadline: number | null;
  log: string[];
}

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("reveal"), index: z.number().int().min(0).max(5) }),
  z.object({ type: z.literal("draw"), from: z.enum(["deck", "discard"]) }),
  z.object({ type: z.literal("swap"), index: z.number().int().min(0).max(5) }),
  z.object({ type: z.literal("discardFlip"), index: z.number().int().min(0).max(5) }),
  z.object({ type: z.literal("next") }),
]);
type Action = z.infer<typeof actionSchema>;

export function golfValue(card: CardId): number {
  const r = rankOf(card);
  if (r === "A") return 1;
  if (r === "2") return -2;
  if (r === "K") return 0;
  if (r === "J" || r === "Q") return 10;
  return Number(r);
}

export function gridScore(grid: CardId[]): number {
  let total = 0;
  for (let col = 0; col < 3; col++) {
    const a = grid[col]!;
    const b = grid[col + 3]!;
    total += rankOf(a) === rankOf(b) ? 0 : golfValue(a) + golfValue(b);
  }
  return total;
}

function dealRound(players: PlayerId[], round: number, ctx: GameContext, prev?: GolfState): GolfState {
  const deck = shuffledDeck(ctx.rng);
  const grids: Record<PlayerId, CardId[]> = {};
  players.forEach((p, i) => (grids[p] = deck.slice(i * 6, i * 6 + 6)));
  const rest = deck.slice(players.length * 6);
  const first = players[(round - 1) % players.length]!;
  return {
    players,
    grids,
    up: Object.fromEntries(players.map((p) => [p, Array(6).fill(false)])),
    deck: rest.slice(1),
    discard: [rest[0]!],
    phase: "reveal",
    turn: first,
    holding: null,
    closer: null,
    finalTurnsLeft: 0,
    round,
    scores: prev?.scores ?? zeroScores(players),
    summaries: prev?.summaries ?? [],
    deadline: deadlineFrom(ctx.now, ctx.config.turnSeconds),
    log: pushLog(prev?.log ?? [], `Hole ${round}: everyone turns up two cards.`),
  };
}

const upCount = (s: GolfState, p: PlayerId) => s.up[p]!.filter(Boolean).length;

function endTurn(state: GolfState, player: PlayerId, ctx: GameContext): GolfState {
  let s = { ...state, holding: null };
  if (!s.closer && upCount(s, player) === 6) {
    s = { ...s, closer: player, finalTurnsLeft: s.players.length - 1, log: pushLog(s.log, `${nameOf(ctx, player)} has turned every card — one last turn each!`) };
  } else if (s.closer) {
    s = { ...s, finalTurnsLeft: s.finalTurnsLeft - 1 };
  }
  if (s.closer && s.finalTurnsLeft <= 0) return scoreRound(s, ctx);
  return { ...s, turn: nextPlayer(s.players, player), deadline: deadlineFrom(ctx.now, ctx.config.turnSeconds) };
}

function scoreRound(state: GolfState, ctx: GameContext): GolfState {
  const roundScores = Object.fromEntries(state.players.map((p) => [p, gridScore(state.grids[p]!)]));
  const scores = Object.fromEntries(state.players.map((p) => [p, state.scores[p]! + roundScores[p]!]));
  const summary: RoundSummary = {
    round: state.round,
    title: `Hole ${state.round} complete`,
    lines: state.players.map((p) => `${nameOf(ctx, p)}: ${roundScores[p]} (total ${scores[p]})`),
    scores: roundScores,
  };
  const over = state.round >= ctx.config.rounds;
  return {
    ...state,
    up: Object.fromEntries(state.players.map((p) => [p, Array(6).fill(true)])),
    scores,
    summaries: [...state.summaries, summary],
    phase: over ? "over" : "roundEnd",
    deadline: over ? null : deadlineFrom(ctx.now, REVEAL_SECONDS),
    log: pushLog(state.log, summary.title),
  };
}

export const golf: GameModule<GolfState, Action> = {
  meta: {
    id: "golf",
    name: "Golf",
    tagline: "Six cards, lowest score wins. Match columns to cancel them.",
    category: "card",
    minPlayers: 2,
    maxPlayers: 6,
    duration: "15–30 min",
    icon: "Flag",
    accent: "mint",
    lowerIsBetter: true,
    supportsBots: true,
    rules: {
      goal: "Have the lowest total after all the holes.",
      steps: [
        "Everyone gets six face-down cards in two rows of three, then turns up any two.",
        "On your turn, draw the top card of the deck or take the top discard.",
        "Swap it with any card in your grid (the old card goes face up on the discard pile)…",
        "…or, if you drew from the deck, discard it and turn up one of your face-down cards.",
        "When someone has all six cards face up, everyone else gets one final turn, then all cards are revealed.",
      ],
      scoring: "Ace 1, Two −2, 3–10 face value, Jack/Queen 10, King 0. Two cards of the same rank in a column score 0.",
      ending: "After the set number of holes the lowest total wins; ties share the win.",
    },
  },
  settings: ["rounds", "turnSeconds"],
  presets: { quick: { rounds: 2, turnSeconds: 20 }, standard: { rounds: 6, turnSeconds: 30 }, long: { rounds: 9, turnSeconds: 45 } },
  actionSchema,

  setup: (players, ctx) => dealRound(players, 1, ctx),

  validate(state, player, action, ctx) {
    if (action.type === "next") {
      if (state.phase !== "roundEnd") return "Nothing to continue.";
      return player === ctx.hostId ? null : "Only the host can continue.";
    }
    if (!state.players.includes(player)) return "You're not playing.";
    if (action.type === "reveal") {
      if (state.phase !== "reveal") return "The reveal is over.";
      if (upCount(state, player) >= 2) return "You've already turned up two cards.";
      return state.up[player]![action.index] ? "That card is already face up." : null;
    }
    if (state.phase !== "play") return "Wait for everyone to reveal.";
    if (state.turn !== player) return "It's not your turn.";
    if (action.type === "draw") {
      if (state.holding) return "You're already holding a card.";
      if (action.from === "discard" && state.discard.length === 0) return "The discard pile is empty.";
      return null;
    }
    if (!state.holding) return "Draw a card first.";
    if (action.type === "discardFlip") {
      if (state.holding.from !== "deck") return "A card taken from the discard pile must be swapped in.";
      if (state.up[player]![action.index]) return "Pick a face-down card to turn up.";
    }
    return null;
  },

  apply(state, player, action, ctx) {
    if (action.type === "next") return dealRound(state.players, state.round + 1, ctx, state);
    if (action.type === "reveal") {
      const up = { ...state.up, [player]: state.up[player]!.map((u, i) => u || i === action.index) };
      const s = { ...state, up };
      if (state.players.every((p) => upCount(s, p) >= 2)) {
        return { ...s, phase: "play" as const, deadline: deadlineFrom(ctx.now, ctx.config.turnSeconds), log: pushLog(s.log, `${nameOf(ctx, s.turn)} tees off.`) };
      }
      return s;
    }
    if (action.type === "draw") {
      if (action.from === "discard") {
        const card = state.discard[state.discard.length - 1]!;
        return { ...state, discard: state.discard.slice(0, -1), holding: { card, from: "discard" } };
      }
      let { deck, discard } = state;
      if (deck.length === 0) ({ drawPile: deck, discard } = recycleDiscards(deck, discard, ctx.rng));
      return { ...state, deck: deck.slice(1), discard, holding: { card: deck[0]!, from: "deck" } };
    }
    const held = state.holding!.card;
    if (action.type === "swap") {
      const old = state.grids[player]![action.index]!;
      const s: GolfState = {
        ...state,
        grids: { ...state.grids, [player]: state.grids[player]!.map((c, i) => (i === action.index ? held : c)) },
        up: { ...state.up, [player]: state.up[player]!.map((u, i) => u || i === action.index) },
        discard: [...state.discard, old],
        log: pushLog(state.log, `${nameOf(ctx, player)} swapped in ${cardLabel(held)} for ${cardLabel(old)}.`),
      };
      return endTurn(s, player, ctx);
    }
    const s: GolfState = {
      ...state,
      discard: [...state.discard, held],
      up: { ...state.up, [player]: state.up[player]!.map((u, i) => u || i === action.index) },
      log: pushLog(state.log, `${nameOf(ctx, player)} discarded ${cardLabel(held)} and turned a card.`),
    };
    return endTurn(s, player, ctx);
  },

  pending(state) {
    if (state.phase === "reveal") return state.players.filter((p) => upCount(state, p) < 2);
    if (state.phase === "play") return [state.turn];
    return [];
  },
  deadline: (state) => (state.phase === "over" ? null : state.deadline),
  onTimeout(state, ctx) {
    if (state.phase === "roundEnd") return dealRound(state.players, state.round + 1, ctx, state);
    if (state.phase === "reveal") return autoPlayFor(golf, state, ctx, golf.pending(state));
    return autoPlayPending(golf, state, ctx);
  },

  botAction(state, player, ctx) {
    const grid = state.grids[player]!;
    const up = state.up[player]!;
    if (state.phase === "reveal") {
      const down = up.map((u, i) => (u ? -1 : i)).filter((i) => i >= 0);
      return upCount(state, player) < 2 ? { type: "reveal", index: ctx.rng.pick(down) } : null;
    }
    if (state.phase !== "play" || state.turn !== player) return null;
    // Value a card would contribute at position i, given its column partner.
    const worth = (card: CardId, i: number) => {
      const partner = i < 3 ? i + 3 : i - 3;
      if (up[partner] && rankOf(grid[partner]!) === rankOf(card)) return -golfValue(grid[partner]!);
      return golfValue(card);
    };
    const current = (i: number) => (up[i] ? worth(grid[i]!, i) : 5); // unknown cards are assumed average
    const bestSpot = (card: CardId) => {
      let best = -1;
      let gain = 0;
      for (let i = 0; i < 6; i++) {
        const g = current(i) - worth(card, i);
        if (g > gain) {
          gain = g;
          best = i;
        }
      }
      return { best, gain };
    };
    if (!state.holding) {
      const top = state.discard[state.discard.length - 1];
      if (top && bestSpot(top).gain >= 3) return { type: "draw", from: "discard" };
      return { type: "draw", from: "deck" };
    }
    const { best, gain } = bestSpot(state.holding.card);
    if (state.holding.from === "discard" || gain >= 2) {
      return { type: "swap", index: best >= 0 ? best : up.findIndex((u) => !u) >= 0 ? up.findIndex((u) => !u) : 0 };
    }
    const down = up.findIndex((u) => !u);
    return down >= 0 ? { type: "discardFlip", index: down } : { type: "swap", index: best >= 0 ? best : 0 };
  },

  isOver: (state) => state.phase === "over",
  results: (state, ctx) => resultsFromScores(state.scores, ctx, { lowerIsBetter: true, order: state.players }),
  roundSummaries: (state) => state.summaries,

  publicView(state): GolfPublic {
    return {
      players: state.players,
      grids: Object.fromEntries(state.players.map((p) => [p, state.grids[p]!.map((c, i) => (state.up[p]![i] ? c : null))])),
      visibleScores: Object.fromEntries(
        state.players.map((p) => [p, state.grids[p]!.reduce((n, c, i) => n + (state.up[p]![i] ? golfValue(c) : 0), 0)]),
      ),
      discardTop: state.discard[state.discard.length - 1] ?? null,
      deckCount: state.deck.length,
      phase: state.phase,
      turn: state.turn,
      holding: state.holding ? (state.holding.from === "discard" ? { from: "discard", card: state.holding.card } : { from: "deck", card: null }) : null,
      closer: state.closer,
      round: state.round,
      scores: state.scores,
      revealed: Object.fromEntries(state.players.map((p) => [p, upCount(state, p)])),
      log: state.log,
    };
  },
  privateView(state, player): GolfPrivate | null {
    if (!state.grids[player]) return null;
    return { hand: state.turn === player && state.holding?.from === "deck" ? [state.holding.card] : [] };
  },
};

export interface GolfPublic {
  players: PlayerId[];
  grids: Record<PlayerId, (CardId | null)[]>;
  visibleScores: Record<PlayerId, number>;
  discardTop: CardId | null;
  deckCount: number;
  phase: GolfState["phase"];
  turn: PlayerId;
  holding: { from: "deck" | "discard"; card: CardId | null } | null;
  closer: PlayerId | null;
  round: number;
  scores: Record<PlayerId, number>;
  revealed: Record<PlayerId, number>;
  log: string[];
}
export interface GolfPrivate {
  /** The card you drew from the deck (only you see it until you place it). */
  hand: CardId[];
}
