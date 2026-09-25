import { z } from "zod";
import {
  type CardId,
  type Rank,
  type Suit,
  SUITS,
  SUIT_NAMES,
  cardLabel,
  deal,
  rankOf,
  recycleDiscards,
  shuffledDeck,
  sortHand,
  suitOf,
} from "@/lib/engine/cards";
import {
  REVEAL_SECONDS,
  deadlineFrom,
  nameOf,
  nextPlayer,
  pushLog,
  resultsFromScores,
  zeroScores,
} from "@/lib/engine/helpers";
import type {
  GameContext,
  GameMeta,
  GameModule,
  PlayerId,
  PresetId,
  GameConfig,
  RoundSummary,
} from "@/lib/engine/types";
import { cardSchema, suitSchema } from "./schemas";

/**
 * Shared engine for "shedding" games — be the first to empty your hand.
 * Crazy Eights and Switch are both configurations of this one engine.
 */
export interface SheddingRules {
  wildRank: Rank;
  drawTwoRank?: Rank;
  skipRank?: Rank;
  reverseRank?: Rank;
  handSize: (players: number) => number;
}

export interface SheddingState {
  players: PlayerId[];
  hands: Record<PlayerId, CardId[]>;
  drawPile: CardId[];
  discard: CardId[];
  activeSuit: Suit;
  turn: PlayerId;
  direction: 1 | -1;
  phase: "play" | "roundEnd" | "over";
  drewThisTurn: boolean;
  pendingDraw: number;
  round: number;
  scores: Record<PlayerId, number>;
  summaries: RoundSummary[];
  turnDeadline: number | null;
  revealDeadline: number | null;
  log: string[];
  lastPlay: { player: PlayerId; card: CardId; suit?: Suit } | null;
  roundWinner: PlayerId | null;
}

export const sheddingActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("play"), card: cardSchema, suit: suitSchema.optional() }),
  z.object({ type: z.literal("draw") }),
  z.object({ type: z.literal("pass") }),
  z.object({ type: z.literal("next") }),
]);
export type SheddingAction = z.infer<typeof sheddingActionSchema>;

export function penaltyValue(card: CardId, rules: SheddingRules): number {
  const r = rankOf(card);
  if (r === rules.wildRank) return 50;
  if (r === rules.drawTwoRank || r === rules.skipRank || r === rules.reverseRank) return 20;
  if (r === "J" || r === "Q" || r === "K") return 10;
  if (r === "A") return 1;
  return Number(r);
}

function isSpecial(card: CardId, rules: SheddingRules) {
  const r = rankOf(card);
  return [rules.wildRank, rules.drawTwoRank, rules.skipRank, rules.reverseRank].includes(r);
}

export function canPlayCard(state: SheddingState, card: CardId, rules: SheddingRules): boolean {
  const top = state.discard[state.discard.length - 1]!;
  if (state.pendingDraw > 0) return rankOf(card) === rules.drawTwoRank;
  if (rankOf(card) === rules.wildRank) return true;
  return suitOf(card) === state.activeSuit || rankOf(card) === rankOf(top);
}

export function legalCards(state: SheddingState, player: PlayerId, rules: SheddingRules): CardId[] {
  if (state.phase !== "play" || state.turn !== player) return [];
  return (state.hands[player] ?? []).filter((c) => canPlayCard(state, c, rules));
}

function drawCards(state: SheddingState, n: number, rng: GameContext["rng"]) {
  let drawPile = state.drawPile;
  let discard = state.discard;
  const drawn: CardId[] = [];
  for (let i = 0; i < n; i++) {
    if (drawPile.length === 0) ({ drawPile, discard } = recycleDiscards(drawPile, discard, rng));
    if (drawPile.length === 0) break;
    drawn.push(drawPile[0]!);
    drawPile = drawPile.slice(1);
  }
  return { drawn, drawPile, discard };
}

function dealRound(players: PlayerId[], round: number, rules: SheddingRules, ctx: GameContext, prev?: SheddingState): SheddingState {
  const deck = shuffledDeck(ctx.rng);
  const { hands, rest } = deal(deck, players.length, rules.handSize(players.length));
  // Start the discard pile with a plain (non-special) card.
  const startIdx = rest.findIndex((c) => !isSpecial(c, rules));
  const start = rest[startIdx]!;
  const drawPile = rest.filter((_, i) => i !== startIdx);
  const first = players[(round - 1) % players.length]!;
  return {
    players,
    hands: Object.fromEntries(players.map((p, i) => [p, hands[i]!])),
    drawPile,
    discard: [start],
    activeSuit: suitOf(start),
    turn: first,
    direction: 1,
    phase: "play",
    drewThisTurn: false,
    pendingDraw: 0,
    round,
    scores: prev?.scores ?? zeroScores(players),
    summaries: prev?.summaries ?? [],
    turnDeadline: deadlineFrom(ctx.now, ctx.config.turnSeconds),
    revealDeadline: null,
    log: pushLog(prev?.log ?? [], `Round ${round}: ${cardLabel(start)} starts the pile.`),
    lastPlay: null,
    roundWinner: null,
  };
}

function endTurn(state: SheddingState, ctx: GameContext, skip = false): SheddingState {
  let next = nextPlayer(state.players, state.turn, state.direction);
  if (skip) next = nextPlayer(state.players, next, state.direction);
  return { ...state, turn: next, drewThisTurn: false, turnDeadline: deadlineFrom(ctx.now, ctx.config.turnSeconds) };
}

function finishRound(state: SheddingState, winner: PlayerId, rules: SheddingRules, ctx: GameContext): SheddingState {
  let gained = 0;
  const lines: string[] = [];
  for (const p of state.players) {
    if (p === winner) continue;
    const pts = (state.hands[p] ?? []).reduce((sum, c) => sum + penaltyValue(c, rules), 0);
    gained += pts;
    lines.push(`${nameOf(ctx, p)} held ${state.hands[p]!.length} cards (${pts} pts)`);
  }
  const scores = { ...state.scores, [winner]: (state.scores[winner] ?? 0) + gained };
  const summary: RoundSummary = {
    round: state.round,
    title: `${nameOf(ctx, winner)} went out and scored ${gained}`,
    lines,
    scores: Object.fromEntries(state.players.map((p) => [p, p === winner ? gained : 0])),
  };
  const over =
    state.round >= ctx.config.rounds || Object.values(scores).some((s) => s >= ctx.config.targetScore);
  return {
    ...state,
    scores,
    summaries: [...state.summaries, summary],
    phase: over ? "over" : "roundEnd",
    turnDeadline: null,
    revealDeadline: over ? null : deadlineFrom(ctx.now, REVEAL_SECONDS),
    roundWinner: winner,
    log: pushLog(state.log, summary.title),
  };
}

export function createSheddingGame(
  meta: GameMeta,
  rules: SheddingRules,
  presets: Record<PresetId, Partial<GameConfig>>,
): GameModule<SheddingState, SheddingAction> {
  const module: GameModule<SheddingState, SheddingAction> = {
    meta,
    settings: ["rounds", "targetScore", "turnSeconds"],
    presets,
    actionSchema: sheddingActionSchema,

    setup: (players, ctx) => dealRound(players, 1, rules, ctx),

    validate(state, player, action, ctx) {
      if (action.type === "next") {
        if (state.phase !== "roundEnd") return "There is no round to continue.";
        if (player !== ctx.hostId) return "Only the host can start the next round.";
        return null;
      }
      if (state.phase !== "play") return "The round is over.";
      if (state.turn !== player) return "It's not your turn.";
      const hand = state.hands[player] ?? [];
      switch (action.type) {
        case "play": {
          if (!hand.includes(action.card)) return "You don't have that card.";
          if (!canPlayCard(state, action.card, rules)) {
            return state.pendingDraw > 0
              ? `You must play a ${rules.drawTwoRank} or draw ${state.pendingDraw}.`
              : `That card doesn't match ${SUIT_NAMES[state.activeSuit]} or the top card's rank.`;
          }
          if (rankOf(action.card) === rules.wildRank && !action.suit) return "Choose a suit for your wild card.";
          return null;
        }
        case "draw":
          if (state.drewThisTurn) return "You already drew this turn — play or pass.";
          if (state.drawPile.length === 0 && state.discard.length <= 1) return "There are no cards left to draw — pass instead.";
          return null;
        case "pass": {
          const noCards = state.drawPile.length === 0 && state.discard.length <= 1;
          if (state.pendingDraw > 0 && !noCards) return `Draw ${state.pendingDraw} cards instead.`;
          if (!state.drewThisTurn && !noCards) return "Draw a card before passing.";
          return null;
        }
      }
    },

    apply(state, player, action, ctx) {
      if (action.type === "next") return dealRound(state.players, state.round + 1, rules, ctx, state);
      if (action.type === "draw") {
        const count = state.pendingDraw > 0 ? state.pendingDraw : 1;
        const { drawn, drawPile, discard } = drawCards(state, count, ctx.rng);
        const hands = { ...state.hands, [player]: [...state.hands[player]!, ...drawn] };
        const drawnState = { ...state, hands, drawPile, discard };
        const msg = `${nameOf(ctx, player)} drew ${drawn.length} card${drawn.length === 1 ? "" : "s"}.`;
        if (state.pendingDraw > 0) {
          return endTurn({ ...drawnState, pendingDraw: 0, log: pushLog(state.log, msg) }, ctx);
        }
        return { ...drawnState, drewThisTurn: true, log: pushLog(state.log, msg) };
      }
      if (action.type === "pass") {
        return endTurn({ ...state, log: pushLog(state.log, `${nameOf(ctx, player)} passed.`) }, ctx);
      }
      // play
      const card = action.card;
      const rank = rankOf(card);
      const hand = state.hands[player]!.filter((c) => c !== card);
      const suit = rank === rules.wildRank ? action.suit! : suitOf(card);
      let next: SheddingState = {
        ...state,
        hands: { ...state.hands, [player]: hand },
        discard: [...state.discard, card],
        activeSuit: suit,
        lastPlay: { player, card, suit: rank === rules.wildRank ? suit : undefined },
        log: pushLog(
          state.log,
          `${nameOf(ctx, player)} played ${cardLabel(card)}${rank === rules.wildRank ? ` and chose ${SUIT_NAMES[suit]}` : ""}.`,
        ),
      };
      if (hand.length === 0) return finishRound(next, player, rules, ctx);
      let skip = false;
      if (rank === rules.drawTwoRank) next = { ...next, pendingDraw: next.pendingDraw + 2 };
      if (rank === rules.skipRank) skip = true;
      if (rank === rules.reverseRank && state.players.length > 2) {
        next = { ...next, direction: next.direction === 1 ? -1 : 1 };
      }
      return endTurn(next, ctx, skip);
    },

    pending: (state) => (state.phase === "play" ? [state.turn] : []),
    deadline: (state) => (state.phase === "play" ? state.turnDeadline : state.phase === "roundEnd" ? state.revealDeadline : null),

    onTimeout(state, ctx) {
      if (state.phase === "roundEnd") return dealRound(state.players, state.round + 1, rules, ctx, state);
      // Auto-play the current player's turn until it passes to someone else.
      let current = state;
      const who = state.turn;
      for (let i = 0; i < 4 && current.phase === "play" && current.turn === who; i++) {
        const action = module.botAction(current, who, ctx);
        if (!action || module.validate(current, who, action, ctx)) break;
        current = module.apply(current, who, action, ctx);
      }
      if (current.phase === "play" && current.turn === who) return endTurn(current, ctx);
      return current;
    },

    botAction(state, player) {
      if (state.phase !== "play" || state.turn !== player) return null;
      const hand = state.hands[player] ?? [];
      const legal = legalCards(state, player, rules);
      const suitCounts = (s: Suit) => hand.filter((c) => suitOf(c) === s && rankOf(c) !== rules.wildRank).length;
      const nonWild = legal.filter((c) => rankOf(c) !== rules.wildRank);
      if (nonWild.length) {
        const best = nonWild.slice().sort((a, b) => suitCounts(suitOf(b)) - suitCounts(suitOf(a)))[0]!;
        return { type: "play", card: best };
      }
      const wild = legal.find((c) => rankOf(c) === rules.wildRank);
      if (wild) {
        const suit = SUITS.slice().sort((a, b) => suitCounts(b) - suitCounts(a))[0]!;
        return { type: "play", card: wild, suit };
      }
      const canDraw = !state.drewThisTurn && !(state.drawPile.length === 0 && state.discard.length <= 1);
      return canDraw ? { type: "draw" } : { type: "pass" };
    },

    isOver: (state) => state.phase === "over",
    results: (state, ctx) => resultsFromScores(state.scores, ctx, { order: state.players }),
    roundSummaries: (state) => state.summaries,

    publicView(state): SheddingPublic {
      return {
        players: state.players,
        handCounts: Object.fromEntries(state.players.map((p) => [p, state.hands[p]?.length ?? 0])),
        topCard: state.discard[state.discard.length - 1] ?? null,
        discardCount: state.discard.length,
        drawCount: state.drawPile.length,
        activeSuit: state.activeSuit,
        turn: state.turn,
        direction: state.direction,
        phase: state.phase,
        drewThisTurn: state.drewThisTurn,
        pendingDraw: state.pendingDraw,
        round: state.round,
        scores: state.scores,
        lastPlay: state.lastPlay,
        roundWinner: state.roundWinner,
        log: state.log,
        rules: {
          wildRank: rules.wildRank,
          drawTwoRank: rules.drawTwoRank ?? null,
          skipRank: rules.skipRank ?? null,
          reverseRank: rules.reverseRank ?? null,
        },
      };
    },

    privateView(state, player): SheddingPrivate | null {
      const hand = state.hands[player];
      if (!hand) return null;
      return {
        hand: sortHand(hand),
        playable: legalCards(state, player, rules),
      };
    },
  };
  return module;
}

export interface SheddingPublic {
  players: PlayerId[];
  handCounts: Record<PlayerId, number>;
  topCard: CardId | null;
  discardCount: number;
  drawCount: number;
  activeSuit: Suit;
  turn: PlayerId;
  direction: 1 | -1;
  phase: SheddingState["phase"];
  drewThisTurn: boolean;
  pendingDraw: number;
  round: number;
  scores: Record<PlayerId, number>;
  lastPlay: SheddingState["lastPlay"];
  roundWinner: PlayerId | null;
  log: string[];
  rules: { wildRank: Rank; drawTwoRank: Rank | null; skipRank: Rank | null; reverseRank: Rank | null };
}

export interface SheddingPrivate {
  hand: CardId[];
  playable: CardId[];
}
