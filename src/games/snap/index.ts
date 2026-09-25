import { z } from "zod";
import { type CardId, cardLabel, deal, rankOf, shuffledDeck } from "@/lib/engine/cards";
import { deadlineFrom, nameOf, nextPlayer, pushLog, resultsFromScores } from "@/lib/engine/helpers";
import type { GameModule, PlayerId } from "@/lib/engine/types";
import { autoPlayPending } from "../shared/auto";

export interface SnapState {
  players: PlayerId[];
  piles: Record<PlayerId, CardId[]>;
  center: CardId[];
  turn: PlayerId;
  flips: number;
  maxFlips: number;
  over: boolean;
  deadline: number | null;
  lastSnap: { player: PlayerId; correct: boolean; cards: number } | null;
  log: string[];
}

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("flip") }),
  /** `seen` is the centre pile size the player saw, so late snaps are rejected fairly. */
  z.object({ type: z.literal("snap"), seen: z.number().int().min(0).max(60) }),
]);
type Action = z.infer<typeof actionSchema>;

const isMatch = (center: CardId[]) =>
  center.length >= 2 && rankOf(center[center.length - 1]!) === rankOf(center[center.length - 2]!);

function nextWithCards(state: SnapState, from: PlayerId): PlayerId {
  let p = from;
  for (let i = 0; i < state.players.length; i++) {
    p = nextPlayer(state.players, p);
    if (state.piles[p]!.length > 0) return p;
  }
  return from;
}

function checkOver(state: SnapState): SnapState {
  const holders = state.players.filter((p) => state.piles[p]!.length > 0);
  if (state.flips >= state.maxFlips || holders.length === 0 || (holders.length === 1 && state.center.length === 0)) {
    return { ...state, over: true, deadline: null };
  }
  return state;
}

export const snap: GameModule<SnapState, Action> = {
  meta: {
    id: "snap",
    name: "Snap",
    tagline: "Spot two matching ranks and hit Snap first.",
    category: "card",
    minPlayers: 2,
    maxPlayers: 8,
    duration: "5–10 min",
    icon: "Zap",
    accent: "amber",
    supportsBots: true,
    rules: {
      goal: "End up with the most cards.",
      steps: [
        "Everyone gets an equal face-down pile.",
        "Take turns flipping your top card onto the centre pile.",
        "When the top two centre cards have the same rank, anyone can hit SNAP. The fastest snap wins the whole centre pile.",
        "Snap when there's no match and one of your cards goes to the bottom of the centre pile.",
        "Too slow? If the pile already changed, your snap simply doesn't count.",
      ],
      scoring: "Your score is the number of cards in your pile at the end.",
      ending: "Ends when one player has all the cards or the flip limit is reached. Most cards wins; ties share the win.",
    },
  },
  settings: ["rounds", "turnSeconds"],
  presets: {
    quick: { rounds: 6, turnSeconds: 8 },
    standard: { rounds: 12, turnSeconds: 10 },
    long: { rounds: 24, turnSeconds: 15 },
  },
  actionSchema,

  setup(players, ctx) {
    const { hands } = deal(shuffledDeck(ctx.rng), players.length, "all");
    return {
      players,
      piles: Object.fromEntries(players.map((p, i) => [p, hands[i]!])),
      center: [],
      turn: players[0]!,
      flips: 0,
      maxFlips: Math.max(10, ctx.config.rounds * players.length),
      over: false,
      deadline: deadlineFrom(ctx.now, ctx.config.turnSeconds),
      lastSnap: null,
      log: ["Get ready to snap!"],
    };
  },

  validate(state, player, action) {
    if (state.over) return "The game is over.";
    if (action.type === "flip") {
      if (state.turn !== player) return "It's not your turn to flip.";
      if (state.piles[player]!.length === 0) return "You have no cards to flip.";
      return null;
    }
    if (action.seen !== state.center.length) return "Too slow — the pile already changed!";
    if (state.center.length === 0) return "There's nothing to snap.";
    return null;
  },

  apply(state, player, action, ctx) {
    if (action.type === "flip") {
      const [card, ...rest] = state.piles[player]!;
      const s: SnapState = {
        ...state,
        piles: { ...state.piles, [player]: rest },
        center: [...state.center, card!],
        flips: state.flips + 1,
      };
      const turned = { ...s, turn: nextWithCards(s, player), deadline: deadlineFrom(ctx.now, ctx.config.turnSeconds) };
      return checkOver(turned);
    }
    if (isMatch(state.center)) {
      const won = state.center.length;
      const s: SnapState = {
        ...state,
        piles: { ...state.piles, [player]: [...state.piles[player]!, ...ctx.rng.shuffle(state.center)] },
        center: [],
        lastSnap: { player, correct: true, cards: won },
        log: pushLog(state.log, `SNAP! ${nameOf(ctx, player)} wins ${won} cards.`),
      };
      const turn = s.piles[s.turn]!.length > 0 ? s.turn : nextWithCards(s, s.turn);
      return checkOver({ ...s, turn });
    }
    // False snap: pay one card to the bottom of the centre pile.
    const [penalty, ...rest] = state.piles[player]!;
    const s: SnapState = {
      ...state,
      piles: { ...state.piles, [player]: penalty ? rest : state.piles[player]! },
      center: penalty ? [penalty, ...state.center] : state.center,
      lastSnap: { player, correct: false, cards: penalty ? 1 : 0 },
      log: pushLog(state.log, `${nameOf(ctx, player)} snapped too soon${penalty ? " and paid a card" : ""}.`),
    };
    const turn = s.piles[s.turn]!.length > 0 ? s.turn : nextWithCards(s, s.turn);
    return checkOver({ ...s, turn });
  },

  pending: (state) => (state.over ? [] : [state.turn]),
  deadline: (state) => (state.over ? null : state.deadline),
  onTimeout: (state, ctx) => autoPlayPending(snap, state, ctx),
  botAction: (state, player) => (!state.over && state.turn === player && state.piles[player]!.length ? { type: "flip" } : null),

  isOver: (state) => state.over,
  results(state, ctx) {
    // Any cards left in the centre are ignored.
    return resultsFromScores(Object.fromEntries(state.players.map((p) => [p, state.piles[p]!.length])), ctx, {
      order: state.players,
    });
  },
  roundSummaries: () => [],

  publicView(state): SnapPublic {
    return {
      players: state.players,
      counts: Object.fromEntries(state.players.map((p) => [p, state.piles[p]!.length])),
      top: state.center.slice(-2),
      centerCount: state.center.length,
      turn: state.turn,
      flips: state.flips,
      maxFlips: state.maxFlips,
      lastSnap: state.lastSnap,
      log: state.log,
      topLabel: state.center.length ? cardLabel(state.center[state.center.length - 1]!) : null,
    };
  },
  privateView: (state, player) => (state.piles[player] ? { pileCount: state.piles[player]!.length } : null),
};

export interface SnapPublic {
  players: PlayerId[];
  counts: Record<PlayerId, number>;
  top: CardId[];
  centerCount: number;
  turn: PlayerId;
  flips: number;
  maxFlips: number;
  lastSnap: SnapState["lastSnap"];
  log: string[];
  topLabel: string | null;
}
