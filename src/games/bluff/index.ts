import { z } from "zod";
import { type CardId, RANKS, type Rank, RANK_NAMES, deal, rankOf, shuffledDeck, sortHand } from "@/lib/engine/cards";
import { deadlineFrom, nameOf, pushLog, resultsFromScores } from "@/lib/engine/helpers";
import type { GameModule, PlayerId } from "@/lib/engine/types";
import { autoPlayPending } from "../shared/auto";
import { cardSchema } from "../shared/schemas";

const CHALLENGE_SECONDS = 12;

export interface BluffState {
  players: PlayerId[];
  hands: Record<PlayerId, CardId[]>;
  pile: CardId[];
  turn: PlayerId;
  required: Rank;
  phase: "play" | "challenge" | "over";
  lastPlay: { player: PlayerId; cards: CardId[]; claim: Rank } | null;
  responses: PlayerId[];
  reveal: { player: PlayerId; caller: PlayerId; cards: CardId[]; lied: boolean; loser: PlayerId } | null;
  winner: PlayerId | null;
  deadline: number | null;
  log: string[];
}

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("play"), cards: z.array(cardSchema).min(1).max(4) }),
  z.object({ type: z.literal("call") }),
  z.object({ type: z.literal("accept") }),
]);
type Action = z.infer<typeof actionSchema>;

const nextRank = (r: Rank): Rank => RANKS[(RANKS.indexOf(r) + 1) % RANKS.length]!;
const others = (s: BluffState, p: PlayerId) => s.players.filter((x) => x !== p);

function nextTurn(s: BluffState, after: PlayerId): PlayerId {
  const i = s.players.indexOf(after);
  return s.players[(i + 1) % s.players.length]!;
}

/** Resolve the challenge window with no challenge. */
function endChallenge(s: BluffState, now: number, turnSeconds: number): BluffState {
  const lp = s.lastPlay!;
  if (s.hands[lp.player]!.length === 0) {
    return { ...s, phase: "over", winner: lp.player, deadline: null, log: pushLog(s.log, "Nobody called it — and that was their last card!") };
  }
  return {
    ...s,
    phase: "play",
    responses: [],
    turn: nextTurn(s, lp.player),
    required: nextRank(lp.claim),
    deadline: deadlineFrom(now, turnSeconds),
  };
}

export const bluff: GameModule<BluffState, Action> = {
  meta: {
    id: "bluff",
    name: "Bluff",
    tagline: "Claim the right rank — truthfully or not.",
    category: "card",
    minPlayers: 3,
    maxPlayers: 8,
    duration: "10–20 min",
    icon: "EyeOff",
    accent: "violet",
    supportsBots: true,
    rules: {
      goal: "Be the first to get rid of all your cards.",
      steps: [
        "All cards are dealt. The required rank starts at Ace and goes up by one each turn (A, 2, 3 … K, then A again).",
        "On your turn, play 1–4 cards face down and claim they're all the required rank. You may lie!",
        "Everyone else then gets a few seconds to call “Bluff!” or let it go.",
        "If someone calls: the cards are revealed. If any card isn't the claimed rank, the player who played them picks up the whole pile. If they were honest, the caller picks it up.",
        "If your last cards survive the challenge window, you win.",
      ],
      scoring: "Your score is the number of cards you're left holding — lower is better.",
      ending: "The first player to empty their hand wins; everyone else is ranked by cards left (equal counts share a place).",
    },
    lowerIsBetter: true,
  },
  settings: ["turnSeconds"],
  presets: { quick: { turnSeconds: 20 }, standard: { turnSeconds: 30 }, long: { turnSeconds: 45 } },
  actionSchema,

  setup(players, ctx) {
    const { hands } = deal(shuffledDeck(ctx.rng), players.length, "all");
    return {
      players,
      hands: Object.fromEntries(players.map((p, i) => [p, hands[i]!])),
      pile: [],
      turn: players[0]!,
      required: "A",
      phase: "play",
      lastPlay: null,
      responses: [],
      reveal: null,
      winner: null,
      deadline: deadlineFrom(ctx.now, ctx.config.turnSeconds),
      log: ["Aces first!"],
    };
  },

  validate(state, player, action) {
    if (state.phase === "over") return "The game is over.";
    if (action.type === "play") {
      if (state.phase !== "play") return "Wait for the challenge to finish.";
      if (state.turn !== player) return "It's not your turn.";
      const hand = state.hands[player]!;
      if (new Set(action.cards).size !== action.cards.length || !action.cards.every((c) => hand.includes(c))) return "You don't have those cards.";
      return null;
    }
    if (state.phase !== "challenge") return "There's nothing to challenge right now.";
    if (state.lastPlay?.player === player) return "You can't challenge your own play.";
    if (state.responses.includes(player)) return "You've already responded.";
    return null;
  },

  apply(state, player, action, ctx) {
    if (action.type === "play") {
      return {
        ...state,
        hands: { ...state.hands, [player]: state.hands[player]!.filter((c) => !action.cards.includes(c)) },
        pile: [...state.pile, ...action.cards],
        lastPlay: { player, cards: action.cards, claim: state.required },
        phase: "challenge",
        responses: [],
        reveal: null,
        deadline: ctx.now + CHALLENGE_SECONDS * 1000,
        log: pushLog(state.log, `${nameOf(ctx, player)} played ${action.cards.length} × ${RANK_NAMES[state.required]}.`),
      };
    }
    if (action.type === "accept") {
      const responses = [...state.responses, player];
      const s = { ...state, responses };
      return responses.length >= others(state, state.lastPlay!.player).length ? endChallenge(s, ctx.now, ctx.config.turnSeconds) : s;
    }
    // Bluff called
    const lp = state.lastPlay!;
    const lied = lp.cards.some((c) => rankOf(c) !== lp.claim);
    const loser = lied ? lp.player : player;
    const s: BluffState = {
      ...state,
      hands: { ...state.hands, [loser]: [...state.hands[loser]!, ...state.pile] },
      pile: [],
      reveal: { player: lp.player, caller: player, cards: lp.cards, lied, loser },
      log: pushLog(
        state.log,
        `${nameOf(ctx, player)} called Bluff on ${nameOf(ctx, lp.player)} — ${lied ? "caught lying!" : "they were honest!"} ${nameOf(ctx, loser)} picks up the pile.`,
      ),
    };
    if (!lied && s.hands[lp.player]!.length === 0) {
      return { ...s, phase: "over", winner: lp.player, deadline: null };
    }
    return {
      ...s,
      phase: "play",
      responses: [],
      turn: nextTurn(s, lp.player),
      required: nextRank(lp.claim),
      deadline: deadlineFrom(ctx.now, ctx.config.turnSeconds),
    };
  },

  pending(state) {
    if (state.phase === "play") return [state.turn];
    if (state.phase === "challenge") return others(state, state.lastPlay!.player).filter((p) => !state.responses.includes(p));
    return [];
  },
  deadline: (state) => (state.phase === "over" ? null : state.deadline),
  onTimeout(state, ctx) {
    if (state.phase === "challenge") return endChallenge(state, ctx.now, ctx.config.turnSeconds);
    return autoPlayPending(bluff, state, ctx);
  },

  botAction(state, player, ctx) {
    const hand = state.hands[player] ?? [];
    if (state.phase === "play" && state.turn === player) {
      const honest = hand.filter((c) => rankOf(c) === state.required);
      if (honest.length) return { type: "play", cards: honest.slice(0, 4) };
      return { type: "play", cards: [ctx.rng.pick(hand)] };
    }
    if (state.phase === "challenge" && state.lastPlay && state.lastPlay.player !== player && !state.responses.includes(player)) {
      const claim = state.lastPlay.claim;
      const mine = hand.filter((c) => rankOf(c) === claim).length;
      const certain = mine + state.lastPlay.cards.length > 4;
      const lastCards = state.hands[state.lastPlay.player]!.length === 0;
      const hunch = { easy: 0.05, normal: 0.12, hard: 0.2 }[ctx.config.difficulty];
      return certain || lastCards || ctx.rng.next() < hunch ? { type: "call" } : { type: "accept" };
    }
    return null;
  },

  isOver: (state) => state.phase === "over",
  results: (state, ctx) =>
    resultsFromScores(Object.fromEntries(state.players.map((p) => [p, state.hands[p]!.length])), ctx, {
      lowerIsBetter: true,
      order: state.players,
    }),
  roundSummaries: () => [],

  publicView(state): BluffPublic {
    return {
      players: state.players,
      handCounts: Object.fromEntries(state.players.map((p) => [p, state.hands[p]!.length])),
      pileCount: state.pile.length,
      turn: state.turn,
      required: state.required,
      phase: state.phase,
      lastPlay: state.lastPlay ? { player: state.lastPlay.player, count: state.lastPlay.cards.length, claim: state.lastPlay.claim } : null,
      responded: state.responses,
      reveal: state.reveal,
      winner: state.winner,
      log: state.log,
    };
  },
  privateView(state, player): BluffPrivate | null {
    const hand = state.hands[player];
    if (!hand) return null;
    return { hand: sortHand(hand, { bySuit: false, acesHigh: false }) };
  },
};

export interface BluffPublic {
  players: PlayerId[];
  handCounts: Record<PlayerId, number>;
  pileCount: number;
  turn: PlayerId;
  required: Rank;
  phase: BluffState["phase"];
  lastPlay: { player: PlayerId; count: number; claim: Rank } | null;
  responded: PlayerId[];
  reveal: BluffState["reveal"];
  winner: PlayerId | null;
  log: string[];
}
export interface BluffPrivate {
  hand: CardId[];
}
