import { z } from "zod";
import { type CardId, type Suit, SUITS, cardLabel, deal, rankValue, shuffledDeck, sortHand, suitOf } from "@/lib/engine/cards";
import { REVEAL_SECONDS, deadlineFrom, nameOf, nextPlayer, pushLog, resultsFromScores, zeroScores } from "@/lib/engine/helpers";
import type { GameContext, GameModule, PlayerId, RoundSummary } from "@/lib/engine/types";
import { autoPlayPending } from "../shared/auto";
import { cardSchema } from "../shared/schemas";

/** Aces are low (1) and kings high (13). */
const v = (c: CardId) => rankValue(c, false);

export interface SevensState {
  players: PlayerId[];
  hands: Record<PlayerId, CardId[]>;
  rows: Record<Suit, { low: number; high: number } | null>;
  turn: PlayerId;
  phase: "play" | "roundEnd" | "over";
  round: number;
  scores: Record<PlayerId, number>;
  summaries: RoundSummary[];
  deadline: number | null;
  log: string[];
  started: boolean;
}

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("play"), card: cardSchema }),
  z.object({ type: z.literal("pass") }),
  z.object({ type: z.literal("next") }),
]);
type Action = z.infer<typeof actionSchema>;

export function sevensLegal(state: SevensState, player: PlayerId): CardId[] {
  if (state.phase !== "play" || state.turn !== player) return [];
  const hand = state.hands[player] ?? [];
  if (!state.started) return hand.includes("7D") ? ["7D"] : [];
  return hand.filter((c) => {
    const row = state.rows[suitOf(c)];
    if (!row) return v(c) === 7;
    return v(c) === row.low - 1 || v(c) === row.high + 1;
  });
}

function dealRound(players: PlayerId[], round: number, ctx: GameContext, prev?: SevensState): SevensState {
  const { hands } = deal(shuffledDeck(ctx.rng), players.length, "all");
  const map = Object.fromEntries(players.map((p, i) => [p, hands[i]!]));
  const first = players.find((p) => map[p]!.includes("7D"))!;
  return {
    players,
    hands: map,
    rows: { S: null, H: null, D: null, C: null },
    turn: first,
    phase: "play",
    round,
    scores: prev?.scores ?? zeroScores(players),
    summaries: prev?.summaries ?? [],
    deadline: deadlineFrom(ctx.now, ctx.config.turnSeconds),
    log: pushLog(prev?.log ?? [], `Round ${round}: ${nameOf(ctx, first)} starts with the 7♦.`),
    started: false,
  };
}

export const sevens: GameModule<SevensState, Action> = {
  meta: {
    id: "sevens",
    name: "Sevens",
    tagline: "Build the suits out from the sevens.",
    category: "card",
    minPlayers: 3,
    maxPlayers: 8,
    duration: "10–20 min",
    icon: "Hash",
    accent: "mint",
    supportsBots: true,
    rules: {
      goal: "Be the first to play all your cards.",
      steps: [
        "All cards are dealt. Whoever holds the 7♦ plays it first.",
        "On your turn, play one card: any 7 starts that suit's row, or play the next card up or down on an existing row (6 or 8 next to a 7, and so on).",
        "Rows run from Ace (low end) to King (high end).",
        "If you can play, you must. If you can't, you pass.",
      ],
      scoring: "The player who goes out scores one point for every card still held by the other players.",
      ending: "Ends after the set number of rounds. Highest total wins; ties share the win.",
    },
  },
  settings: ["rounds", "turnSeconds"],
  presets: {
    quick: { rounds: 1, turnSeconds: 15 },
    standard: { rounds: 3, turnSeconds: 25 },
    long: { rounds: 5, turnSeconds: 40 },
  },
  actionSchema,

  setup: (players, ctx) => dealRound(players, 1, ctx),

  validate(state, player, action, ctx) {
    if (action.type === "next") {
      if (state.phase !== "roundEnd") return "Nothing to continue.";
      return player === ctx.hostId ? null : "Only the host can continue.";
    }
    if (state.phase !== "play") return "The round is over.";
    if (state.turn !== player) return "It's not your turn.";
    const legal = sevensLegal(state, player);
    if (action.type === "pass") return legal.length ? "You have a card you can play — you must play it." : null;
    if (!state.hands[player]!.includes(action.card)) return "You don't have that card.";
    return legal.includes(action.card) ? null : "That card doesn't fit on the layout yet.";
  },

  apply(state, player, action, ctx) {
    if (action.type === "next") return dealRound(state.players, state.round + 1, ctx, state);
    if (action.type === "pass") {
      return {
        ...state,
        turn: nextPlayer(state.players, player),
        deadline: deadlineFrom(ctx.now, ctx.config.turnSeconds),
        log: pushLog(state.log, `${nameOf(ctx, player)} passed.`),
      };
    }
    const s = suitOf(action.card);
    const row = state.rows[s];
    const rows = {
      ...state.rows,
      [s]: row ? { low: Math.min(row.low, v(action.card)), high: Math.max(row.high, v(action.card)) } : { low: 7, high: 7 },
    };
    const hand = state.hands[player]!.filter((c) => c !== action.card);
    const next: SevensState = {
      ...state,
      rows,
      started: true,
      hands: { ...state.hands, [player]: hand },
      log: pushLog(state.log, `${nameOf(ctx, player)} played ${cardLabel(action.card)}.`),
    };
    if (hand.length === 0) {
      const gained = state.players.filter((p) => p !== player).reduce((n, p) => n + state.hands[p]!.length, 0);
      const scores = { ...state.scores, [player]: state.scores[player]! + gained };
      const summary: RoundSummary = {
        round: state.round,
        title: `${nameOf(ctx, player)} went out and scored ${gained}`,
        lines: state.players.filter((p) => p !== player).map((p) => `${nameOf(ctx, p)} held ${state.hands[p]!.length}`),
        scores: Object.fromEntries(state.players.map((p) => [p, p === player ? gained : 0])),
      };
      const over = state.round >= ctx.config.rounds;
      return {
        ...next,
        scores,
        summaries: [...state.summaries, summary],
        phase: over ? "over" : "roundEnd",
        deadline: over ? null : deadlineFrom(ctx.now, REVEAL_SECONDS),
        log: pushLog(next.log, summary.title),
      };
    }
    return { ...next, turn: nextPlayer(state.players, player), deadline: deadlineFrom(ctx.now, ctx.config.turnSeconds) };
  },

  pending: (state) => (state.phase === "play" ? [state.turn] : []),
  deadline: (state) => (state.phase === "over" ? null : state.deadline),
  onTimeout(state, ctx) {
    if (state.phase === "roundEnd") return dealRound(state.players, state.round + 1, ctx, state);
    return autoPlayPending(sevens, state, ctx);
  },
  botAction(state, player) {
    if (state.phase !== "play" || state.turn !== player) return null;
    const legal = sevensLegal(state, player);
    if (!legal.length) return { type: "pass" };
    // Prefer extending rows over opening new sevens.
    const pick = legal.find((c) => v(c) !== 7) ?? legal[0]!;
    return { type: "play", card: pick };
  },

  isOver: (state) => state.phase === "over",
  results: (state, ctx) => resultsFromScores(state.scores, ctx, { order: state.players }),
  roundSummaries: (state) => state.summaries,

  publicView(state): SevensPublic {
    return {
      players: state.players,
      handCounts: Object.fromEntries(state.players.map((p) => [p, state.hands[p]!.length])),
      rows: Object.fromEntries(SUITS.map((s) => [s, state.rows[s]])) as SevensPublic["rows"],
      turn: state.turn,
      phase: state.phase,
      round: state.round,
      scores: state.scores,
      log: state.log,
    };
  },
  privateView(state, player): SevensPrivate | null {
    const hand = state.hands[player];
    if (!hand) return null;
    return { hand: sortHand(hand, { acesHigh: false }), legal: sevensLegal(state, player) };
  },
};

export interface SevensPublic {
  players: PlayerId[];
  handCounts: Record<PlayerId, number>;
  rows: Record<Suit, { low: number; high: number } | null>;
  turn: PlayerId;
  phase: SevensState["phase"];
  round: number;
  scores: Record<PlayerId, number>;
  log: string[];
}
export interface SevensPrivate {
  hand: CardId[];
  legal: CardId[];
}
