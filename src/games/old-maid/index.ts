import { z } from "zod";
import { type CardId, deal, rankOf, shuffledDeck, sortHand } from "@/lib/engine/cards";
import { deadlineFrom, nameOf, pushLog, resultsFromScores } from "@/lib/engine/helpers";
import type { GameContext, GameModule, PlayerId } from "@/lib/engine/types";
import { autoPlayPending } from "../shared/auto";

/** The removed card: only one queen of clubs-matching pair remains unmatched. */
const REMOVED = "QC";
const OLD_MAID = "QS";

export interface OldMaidState {
  players: PlayerId[];
  hands: Record<PlayerId, CardId[]>;
  turn: PlayerId;
  discarded: number;
  safeOrder: PlayerId[];
  loser: PlayerId | null;
  deadline: number | null;
  lastDraw: { from: PlayerId; to: PlayerId; paired: boolean } | null;
  log: string[];
}

const actionSchema = z.object({ type: z.literal("draw"), index: z.number().int().min(0).max(60) });
type Action = z.infer<typeof actionSchema>;

function discardPairs(hand: CardId[]): { hand: CardId[]; removed: number } {
  const byRank = new Map<string, CardId[]>();
  for (const c of hand) byRank.set(rankOf(c), [...(byRank.get(rankOf(c)) ?? []), c]);
  const out: CardId[] = [];
  let removed = 0;
  for (const cards of byRank.values()) {
    if (cards.length % 2 === 1) out.push(cards[cards.length - 1]!);
    removed += cards.length - (cards.length % 2);
  }
  return { hand: out, removed };
}

function active(state: OldMaidState): PlayerId[] {
  return state.players.filter((p) => state.hands[p]!.length > 0);
}

/** The next player (clockwise) after `p` who still holds cards. */
function nextActive(state: OldMaidState, p: PlayerId): PlayerId {
  const n = state.players.length;
  const i = state.players.indexOf(p);
  for (let k = 1; k <= n; k++) {
    const q = state.players[(i + k) % n]!;
    if (state.hands[q]!.length > 0) return q;
  }
  return p;
}

function markSafe(state: OldMaidState, ctx: GameContext): OldMaidState {
  let s = state;
  for (const p of s.players) {
    if (s.hands[p]!.length === 0 && !s.safeOrder.includes(p)) {
      s = { ...s, safeOrder: [...s.safeOrder, p], log: pushLog(s.log, `${nameOf(ctx, p)} is out of cards — safe!`) };
    }
  }
  const left = active(s);
  if (left.length <= 1) {
    const loser = left[0] ?? null;
    return {
      ...s,
      loser,
      deadline: null,
      log: pushLog(s.log, loser ? `${nameOf(ctx, loser)} is left holding the Old Maid!` : "Everyone's safe!"),
    };
  }
  return s;
}

export const oldMaid: GameModule<OldMaidState, Action> = {
  meta: {
    id: "old-maid",
    name: "Old Maid",
    tagline: "Pair up and pass on the odd queen.",
    category: "card",
    minPlayers: 2,
    maxPlayers: 8,
    duration: "5–10 min",
    icon: "Ghost",
    accent: "violet",
    supportsBots: true,
    rules: {
      goal: "Don't be the one left holding the Old Maid (the unpaired Queen of Spades).",
      steps: [
        "The Queen of Clubs is removed, so the Queen of Spades has no partner. All other cards are dealt out.",
        "Any pairs of the same rank are discarded automatically.",
        "On your turn, pick a face-down card from the next player who still has cards.",
        "If it pairs with one of yours, the pair is discarded. Then play passes on.",
        "Run out of cards and you're safe.",
      ],
      scoring: "Everyone who gets out scores 1 point. The Old Maid scores 0.",
      ending: "The game ends when only one player has cards left. All safe players share the win.",
    },
  },
  settings: ["turnSeconds"],
  presets: { quick: { turnSeconds: 10 }, standard: { turnSeconds: 20 }, long: { turnSeconds: 40 } },
  actionSchema,

  setup(players, ctx) {
    const deck = shuffledDeck(ctx.rng, (c) => c !== REMOVED);
    const { hands } = deal(deck, players.length, "all");
    let discarded = 0;
    const handMap: Record<PlayerId, CardId[]> = {};
    players.forEach((p, i) => {
      const r = discardPairs(hands[i]!);
      handMap[p] = ctx.rng.shuffle(r.hand);
      discarded += r.removed;
    });
    const s: OldMaidState = {
      players,
      hands: handMap,
      turn: players[0]!,
      discarded,
      safeOrder: [],
      loser: null,
      deadline: deadlineFrom(ctx.now, ctx.config.turnSeconds),
      lastDraw: null,
      log: ["Pairs discarded. Let's find the Old Maid!"],
    };
    const settled = markSafe(s, ctx);
    return settled.loser !== null || active(settled).length <= 1
      ? settled
      : { ...settled, turn: nextActive(settled, players[players.length - 1]!) };
  },

  validate(state, player, action) {
    if (state.loser !== null || active(state).length <= 1) return "The game is over.";
    if (state.turn !== player) return "It's not your turn.";
    const from = nextActive(state, player);
    if (action.index >= state.hands[from]!.length) return "Pick one of their cards.";
    return null;
  },

  apply(state, player, action, ctx) {
    const from = nextActive(state, player);
    const card = state.hands[from]![action.index]!;
    const fromHand = state.hands[from]!.filter((_, i) => i !== action.index);
    const { hand, removed } = discardPairs([...state.hands[player]!, card]);
    let s: OldMaidState = {
      ...state,
      hands: { ...state.hands, [from]: ctx.rng.shuffle(fromHand), [player]: ctx.rng.shuffle(hand) },
      discarded: state.discarded + removed,
      lastDraw: { from, to: player, paired: removed > 0 },
      log: pushLog(
        state.log,
        `${nameOf(ctx, player)} took a card from ${nameOf(ctx, from)}${removed ? " and made a pair" : ""}.`,
      ),
    };
    s = markSafe(s, ctx);
    if (s.loser !== null || active(s).length <= 1) return s;
    return { ...s, turn: nextActive(s, player), deadline: deadlineFrom(ctx.now, ctx.config.turnSeconds) };
  },

  pending: (state) => (state.loser !== null || active(state).length <= 1 ? [] : [state.turn]),
  deadline: (state) => (state.loser !== null ? null : state.deadline),
  onTimeout: (state, ctx) => autoPlayPending(oldMaid, state, ctx),
  botAction(state, player, ctx) {
    if (state.turn !== player || state.loser !== null) return null;
    const n = state.hands[nextActive(state, player)]!.length;
    return n ? { type: "draw", index: ctx.rng.int(n) } : null;
  },

  isOver: (state) => state.loser !== null || active(state).length <= 1,
  results: (state, ctx) =>
    resultsFromScores(Object.fromEntries(state.players.map((p) => [p, p === state.loser ? 0 : 1])), ctx, {
      order: state.players,
    }),
  roundSummaries: () => [],

  publicView(state): OldMaidPublic {
    const over = state.loser !== null || active(state).length <= 1;
    return {
      players: state.players,
      handCounts: Object.fromEntries(state.players.map((p) => [p, state.hands[p]!.length])),
      turn: state.turn,
      drawFrom: over ? null : nextActive(state, state.turn),
      discarded: state.discarded,
      safe: state.safeOrder,
      loser: state.loser,
      lastDraw: state.lastDraw,
      log: state.log,
    };
  },
  privateView(state, player): OldMaidPrivate | null {
    const hand = state.hands[player];
    if (!hand) return null;
    return { hand: sortHand(hand, { bySuit: false }), holdsOldMaid: hand.includes(OLD_MAID) };
  },
};

export interface OldMaidPublic {
  players: PlayerId[];
  handCounts: Record<PlayerId, number>;
  turn: PlayerId;
  drawFrom: PlayerId | null;
  discarded: number;
  safe: PlayerId[];
  loser: PlayerId | null;
  lastDraw: OldMaidState["lastDraw"];
  log: string[];
}
export interface OldMaidPrivate {
  hand: CardId[];
  holdsOldMaid: boolean;
}
