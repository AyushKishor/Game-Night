import { z } from "zod";
import { type CardId, type Rank, RANK_NAMES, deal, rankOf, shuffledDeck, sortHand } from "@/lib/engine/cards";
import { deadlineFrom, nameOf, nextPlayer, pushLog, resultsFromScores } from "@/lib/engine/helpers";
import type { GameContext, GameModule, PlayerId } from "@/lib/engine/types";
import { autoPlayPending } from "../shared/auto";
import { playerIdSchema, rankSchema } from "../shared/schemas";

export interface GoFishState {
  players: PlayerId[];
  hands: Record<PlayerId, CardId[]>;
  deck: CardId[];
  books: Record<PlayerId, Rank[]>;
  turn: PlayerId;
  over: boolean;
  deadline: number | null;
  lastAsk: { asker: PlayerId; target: PlayerId; rank: Rank; got: number; drewMatch: boolean } | null;
  log: string[];
}

const actionSchema = z.object({ type: z.literal("ask"), target: playerIdSchema, rank: rankSchema });
type Action = z.infer<typeof actionSchema>;

/** Lay down any complete sets of four. */
function collectBooks(state: GoFishState, player: PlayerId, ctx: GameContext): GoFishState {
  const hand = state.hands[player]!;
  const counts = new Map<Rank, number>();
  for (const c of hand) counts.set(rankOf(c), (counts.get(rankOf(c)) ?? 0) + 1);
  const complete = [...counts.entries()].filter(([, n]) => n === 4).map(([r]) => r);
  if (!complete.length) return state;
  return {
    ...state,
    hands: { ...state.hands, [player]: hand.filter((c) => !complete.includes(rankOf(c))) },
    books: { ...state.books, [player]: [...state.books[player]!, ...complete] },
    log: pushLog(state.log, ...complete.map((r) => `${nameOf(ctx, player)} completed a book of ${RANK_NAMES[r]}s!`)),
  };
}

/** Make sure the player whose turn it is can act; refill empty hands; detect the end. */
function settle(state: GoFishState, ctx: GameContext): GoFishState {
  let s = state;
  const totalBooks = Object.values(s.books).reduce((n, b) => n + b.length, 0);
  if (totalBooks === 13) return { ...s, over: true, deadline: null };
  for (let guard = 0; guard < s.players.length * 2; guard++) {
    const hand = s.hands[s.turn]!;
    if (hand.length > 0) break;
    if (s.deck.length > 0) {
      s = { ...s, hands: { ...s.hands, [s.turn]: [s.deck[0]!] }, deck: s.deck.slice(1) };
      s = collectBooks(s, s.turn, ctx);
      if (s.hands[s.turn]!.length > 0) break;
    }
    s = { ...s, turn: nextPlayer(s.players, s.turn) };
  }
  if (s.players.every((p) => s.hands[p]!.length === 0) && s.deck.length === 0) return { ...s, over: true, deadline: null };
  return { ...s, deadline: deadlineFrom(ctx.now, ctx.config.turnSeconds) };
}

function targets(state: GoFishState, player: PlayerId) {
  return state.players.filter((p) => p !== player && state.hands[p]!.length > 0);
}

export const goFish: GameModule<GoFishState, Action> = {
  meta: {
    id: "go-fish",
    name: "Go Fish",
    tagline: "Ask for ranks, collect sets of four.",
    category: "card",
    minPlayers: 2,
    maxPlayers: 6,
    duration: "10–15 min",
    icon: "Fish",
    accent: "sky",
    supportsBots: true,
    rules: {
      goal: "Collect the most books (all four cards of a rank).",
      steps: [
        "Everyone gets 7 cards (5 with four or more players). The rest form the pond.",
        "On your turn, ask another player for a rank you already hold.",
        "If they have any, they hand them all over and you go again.",
        "If not — Go Fish! Draw one card. If it's the rank you asked for, go again; otherwise play passes on.",
        "Complete sets of four are laid down automatically. If your hand is empty, you draw a card at the start of your turn.",
      ],
      scoring: "One point per book.",
      ending: "The game ends when all 13 books are made. Most books wins; ties share the win.",
    },
  },
  settings: ["turnSeconds"],
  presets: {
    quick: { turnSeconds: 15 },
    standard: { turnSeconds: 30 },
    long: { turnSeconds: 60 },
  },
  actionSchema,

  setup(players, ctx) {
    const { hands, rest } = deal(shuffledDeck(ctx.rng), players.length, players.length >= 4 ? 5 : 7);
    let s: GoFishState = {
      players,
      hands: Object.fromEntries(players.map((p, i) => [p, hands[i]!])),
      deck: rest,
      books: Object.fromEntries(players.map((p) => [p, []])),
      turn: players[0]!,
      over: false,
      deadline: null,
      lastAsk: null,
      log: [],
    };
    for (const p of players) s = collectBooks(s, p, ctx);
    return settle(s, ctx);
  },

  validate(state, player, action) {
    if (state.over) return "The game is over.";
    if (state.turn !== player) return "It's not your turn.";
    if (action.target === player) return "Ask someone else.";
    if (!state.players.includes(action.target)) return "That player isn't in this game.";
    if (state.hands[action.target]!.length === 0) return "That player has no cards — ask someone else.";
    if (!state.hands[player]!.some((c) => rankOf(c) === action.rank)) return "You can only ask for a rank you hold.";
    return null;
  },

  apply(state, player, action, ctx) {
    const matching = state.hands[action.target]!.filter((c) => rankOf(c) === action.rank);
    let s: GoFishState;
    if (matching.length) {
      s = {
        ...state,
        hands: {
          ...state.hands,
          [action.target]: state.hands[action.target]!.filter((c) => rankOf(c) !== action.rank),
          [player]: [...state.hands[player]!, ...matching],
        },
        lastAsk: { asker: player, target: action.target, rank: action.rank, got: matching.length, drewMatch: false },
        log: pushLog(
          state.log,
          `${nameOf(ctx, action.target)} gave ${nameOf(ctx, player)} ${matching.length} × ${RANK_NAMES[action.rank]}.`,
        ),
      };
      s = collectBooks(s, player, ctx);
      return settle(s, ctx);
    }
    const drawn = state.deck[0];
    const drewMatch = !!drawn && rankOf(drawn) === action.rank;
    s = {
      ...state,
      hands: { ...state.hands, [player]: drawn ? [...state.hands[player]!, drawn] : state.hands[player]! },
      deck: state.deck.slice(1),
      lastAsk: { asker: player, target: action.target, rank: action.rank, got: 0, drewMatch },
      log: pushLog(
        state.log,
        `${nameOf(ctx, player)} asked ${nameOf(ctx, action.target)} for ${RANK_NAMES[action.rank]}s — Go Fish!${drewMatch ? " …and fished one up!" : ""}`,
      ),
    };
    s = collectBooks(s, player, ctx);
    if (!drewMatch) s = { ...s, turn: nextPlayer(s.players, player) };
    return settle(s, ctx);
  },

  pending: (state) => (state.over ? [] : [state.turn]),
  deadline: (state) => (state.over ? null : state.deadline),
  onTimeout: (state, ctx) => autoPlayPending(goFish, state, ctx),

  botAction(state, player, ctx) {
    if (state.over || state.turn !== player) return null;
    const hand = state.hands[player]!;
    const opts = targets(state, player);
    if (!hand.length || !opts.length) return null;
    const counts = new Map<Rank, number>();
    for (const c of hand) counts.set(rankOf(c), (counts.get(rankOf(c)) ?? 0) + 1);
    const rank = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    // Remember who asked for this rank recently (public information).
    const hint =
      state.lastAsk && state.lastAsk.rank === rank && state.lastAsk.asker !== player && opts.includes(state.lastAsk.asker);
    return { type: "ask", target: hint ? state.lastAsk!.asker : ctx.rng.pick(opts), rank };
  },

  isOver: (state) => state.over,
  results: (state, ctx) =>
    resultsFromScores(Object.fromEntries(state.players.map((p) => [p, state.books[p]!.length])), ctx, { order: state.players }),
  roundSummaries: () => [],

  publicView(state): GoFishPublic {
    return {
      players: state.players,
      handCounts: Object.fromEntries(state.players.map((p) => [p, state.hands[p]!.length])),
      deckCount: state.deck.length,
      books: state.books,
      turn: state.turn,
      over: state.over,
      lastAsk: state.lastAsk,
      log: state.log,
    };
  },
  privateView(state, player): GoFishPrivate | null {
    const hand = state.hands[player];
    if (!hand) return null;
    return { hand: sortHand(hand, { bySuit: false }), ranks: [...new Set(hand.map(rankOf))] };
  },
};

export interface GoFishPublic {
  players: PlayerId[];
  handCounts: Record<PlayerId, number>;
  deckCount: number;
  books: Record<PlayerId, Rank[]>;
  turn: PlayerId;
  over: boolean;
  lastAsk: GoFishState["lastAsk"];
  log: string[];
}
export interface GoFishPrivate {
  hand: CardId[];
  ranks: Rank[];
}
