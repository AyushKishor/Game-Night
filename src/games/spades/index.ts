import { z } from "zod";
import { type CardId, deal, rankOf, rankValue, shuffledDeck, sortHand, suitOf } from "@/lib/engine/cards";
import { REVEAL_SECONDS, deadlineFrom, nameOf, nextPlayer, pushLog, resultsFromScores, zeroScores } from "@/lib/engine/helpers";
import type { GameContext, GameModule, PlayerId, RoundSummary } from "@/lib/engine/types";
import { autoPlayPending } from "../shared/auto";
import { cardSchema } from "../shared/schemas";
import { type TrickPlay, legalTrickPlays, lowest, trickWinner, winningOptions } from "../shared/tricks";

export interface SpadesState {
  players: PlayerId[];
  /** Team index per player. With team mode, seats 0&2 vs 1&3. */
  teamOf: Record<PlayerId, number>;
  teams: number;
  hands: Record<PlayerId, CardId[]>;
  phase: "bid" | "play" | "roundEnd" | "over";
  dealer: number;
  bids: Record<PlayerId, number | null>;
  trick: TrickPlay[];
  lastTrick: { plays: TrickPlay[]; winner: PlayerId } | null;
  turn: PlayerId;
  tricksWon: Record<PlayerId, number>;
  spadesBroken: boolean;
  round: number;
  teamScores: number[];
  teamBags: number[];
  summaries: RoundSummary[];
  deadline: number | null;
  log: string[];
}

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bid"), bid: z.number().int().min(0).max(13) }),
  z.object({ type: z.literal("play"), card: cardSchema }),
  z.object({ type: z.literal("next") }),
]);
type Action = z.infer<typeof actionSchema>;

function dealRound(state: Omit<SpadesState, "hands" | "phase" | "bids" | "trick" | "lastTrick" | "turn" | "tricksWon" | "spadesBroken" | "deadline">, ctx: GameContext): SpadesState {
  const { hands } = deal(shuffledDeck(ctx.rng), 4, 13);
  const first = state.players[(state.dealer + 1) % 4]!;
  return {
    ...state,
    hands: Object.fromEntries(state.players.map((p, i) => [p, hands[i]!])),
    phase: "bid",
    bids: Object.fromEntries(state.players.map((p) => [p, null])),
    trick: [],
    lastTrick: null,
    turn: first,
    tricksWon: zeroScores(state.players),
    spadesBroken: false,
    deadline: deadlineFrom(ctx.now, ctx.config.turnSeconds),
    log: pushLog(state.log, `Round ${state.round}: bidding starts with ${nameOf(ctx, first)}.`),
  };
}

function legal(state: SpadesState, player: PlayerId): CardId[] {
  if (state.phase !== "play" || state.turn !== player) return [];
  return legalTrickPlays(state.hands[player]!, state.trick, { restrictedLeadSuit: "S", broken: state.spadesBroken });
}

export function scoreRound(state: SpadesState): { deltas: number[]; bags: number[]; lines: string[] } {
  const deltas = Array(state.teams).fill(0) as number[];
  const bags = state.teamBags.slice();
  const lines: string[] = [];
  for (let t = 0; t < state.teams; t++) {
    const members = state.players.filter((p) => state.teamOf[p] === t);
    const contract = members.reduce((s, p) => s + (state.bids[p] ?? 0), 0);
    const tricks = members.reduce((s, p) => s + state.tricksWon[p]!, 0);
    for (const p of members) {
      if (state.bids[p] === 0) deltas[t]! += state.tricksWon[p] === 0 ? 100 : -100;
    }
    if (contract > 0) {
      if (tricks >= contract) {
        const over = tricks - contract;
        deltas[t]! += contract * 10 + over;
        bags[t]! += over;
      } else {
        deltas[t]! -= contract * 10;
      }
    } else {
      bags[t]! += tricks;
    }
    while (bags[t]! >= 10) {
      bags[t]! -= 10;
      deltas[t]! -= 100;
    }
    lines.push(`Bid ${contract}, took ${tricks}: ${deltas[t]! >= 0 ? "+" : ""}${deltas[t]}`);
  }
  return { deltas, bags, lines };
}

function playerScores(state: SpadesState): Record<PlayerId, number> {
  return Object.fromEntries(state.players.map((p) => [p, state.teamScores[state.teamOf[p]!]!]));
}

function teamName(state: SpadesState, t: number, ctx: GameContext) {
  return state.players
    .filter((p) => state.teamOf[p] === t)
    .map((p) => nameOf(ctx, p))
    .join(" & ");
}

export const spades: GameModule<SpadesState, Action> = {
  meta: {
    id: "spades",
    name: "Spades",
    tagline: "Bid your tricks with a partner. Spades are always trump.",
    category: "card",
    minPlayers: 4,
    maxPlayers: 4,
    duration: "25–45 min",
    icon: "Spade",
    accent: "sky",
    supportsBots: true,
    rules: {
      goal: "Win exactly the number of tricks your side bids — or more.",
      steps: [
        "Four players get 13 cards. Partners sit opposite each other (turn off team mode to play every-player-for-themselves).",
        "Starting left of the dealer, everyone bids how many tricks they expect to win (0 means “nil”).",
        "Follow the led suit if you can. If you can't, you may play a spade (trump) or any card.",
        "The highest spade wins the trick, otherwise the highest card of the led suit.",
        "Spades can't be led until one has been played on another suit (unless you only have spades).",
      ],
      scoring:
        "Make your side's combined bid: +10 per bid trick and +1 per extra trick (a “bag”). Miss it: −10 per bid trick. Every 10 bags costs 100. Nil bids score +100 if you take no tricks, −100 if you do.",
      ending: "The game ends when a side reaches the target score or after the set number of rounds. Highest score wins; ties share the win.",
    },
  },
  settings: ["rounds", "targetScore", "turnSeconds", "teamMode"],
  presets: {
    quick: { rounds: 2, targetScore: 150, turnSeconds: 20, teamMode: true },
    standard: { rounds: 6, targetScore: 300, turnSeconds: 30, teamMode: true },
    long: { rounds: 12, targetScore: 500, turnSeconds: 45, teamMode: true },
  },
  actionSchema,

  setup(players, ctx) {
    const team = ctx.config.teamMode;
    return dealRound(
      {
        players,
        teamOf: Object.fromEntries(players.map((p, i) => [p, team ? i % 2 : i])),
        teams: team ? 2 : 4,
        dealer: 0,
        round: 1,
        teamScores: Array(team ? 2 : 4).fill(0),
        teamBags: Array(team ? 2 : 4).fill(0),
        summaries: [],
        log: [],
      },
      ctx,
    );
  },

  validate(state, player, action, ctx) {
    if (action.type === "next") {
      if (state.phase !== "roundEnd") return "Nothing to continue.";
      return player === ctx.hostId ? null : "Only the host can continue.";
    }
    if (state.turn !== player) return "It's not your turn.";
    if (action.type === "bid") return state.phase === "bid" ? null : "Bidding is over.";
    if (state.phase !== "play") return "Wait for bidding to finish.";
    if (!state.hands[player]!.includes(action.card)) return "You don't have that card.";
    if (!legal(state, player).includes(action.card)) {
      return state.trick.length ? "You must follow the led suit." : "Spades haven't been broken yet.";
    }
    return null;
  },

  apply(state, player, action, ctx) {
    if (action.type === "next") {
      return dealRound({ ...state, round: state.round + 1, dealer: (state.dealer + 1) % 4 }, ctx);
    }
    if (action.type === "bid") {
      const bids = { ...state.bids, [player]: action.bid };
      const log = pushLog(state.log, `${nameOf(ctx, player)} bid ${action.bid === 0 ? "nil" : action.bid}.`);
      const done = Object.values(bids).every((b) => b !== null);
      const leader = state.players[(state.dealer + 1) % 4]!;
      return {
        ...state,
        bids,
        log,
        phase: done ? "play" : "bid",
        turn: done ? leader : nextPlayer(state.players, player),
        deadline: deadlineFrom(ctx.now, ctx.config.turnSeconds),
      };
    }
    const trick = [...state.trick, { player, card: action.card }];
    let next: SpadesState = {
      ...state,
      hands: { ...state.hands, [player]: state.hands[player]!.filter((c) => c !== action.card) },
      trick,
      spadesBroken: state.spadesBroken || suitOf(action.card) === "S",
      deadline: deadlineFrom(ctx.now, ctx.config.turnSeconds),
    };
    if (trick.length < 4) return { ...next, turn: nextPlayer(state.players, player) };
    const winner = trickWinner(trick, "S").player;
    next = {
      ...next,
      trick: [],
      lastTrick: { plays: trick, winner },
      tricksWon: { ...next.tricksWon, [winner]: next.tricksWon[winner]! + 1 },
      turn: winner,
      log: pushLog(state.log, `${nameOf(ctx, winner)} won the trick.`),
    };
    if (next.hands[winner]!.length > 0) return next;
    // Round over
    const { deltas, bags, lines } = scoreRound(next);
    const teamScores = next.teamScores.map((s, t) => s + deltas[t]!);
    const summary: RoundSummary = {
      round: next.round,
      title: `Round ${next.round} scored`,
      lines: lines.map((l, t) => `${teamName(next, t, ctx)} — ${l}`),
      scores: Object.fromEntries(next.players.map((p) => [p, deltas[next.teamOf[p]!]!])),
    };
    const over = next.round >= ctx.config.rounds || teamScores.some((s) => s >= ctx.config.targetScore);
    return {
      ...next,
      teamScores,
      teamBags: bags,
      summaries: [...next.summaries, summary],
      phase: over ? "over" : "roundEnd",
      deadline: over ? null : deadlineFrom(ctx.now, REVEAL_SECONDS),
      log: pushLog(next.log, summary.title),
    };
  },

  pending: (state) => (state.phase === "bid" || state.phase === "play" ? [state.turn] : []),
  deadline: (state) => (state.phase === "over" ? null : state.deadline),
  onTimeout(state, ctx) {
    if (state.phase === "roundEnd") return spades.apply(state, ctx.hostId, { type: "next" }, ctx);
    return autoPlayPending(spades, state, ctx);
  },

  botAction(state, player) {
    if (state.turn !== player) return null;
    const hand = state.hands[player]!;
    if (state.phase === "bid") {
      const spadesHeld = hand.filter((c) => suitOf(c) === "S");
      let bid = hand.filter((c) => rankOf(c) === "A").length;
      bid += hand.filter((c) => rankOf(c) === "K" && suitOf(c) !== "S").length * 0.6;
      bid += spadesHeld.filter((c) => rankValue(c, true) >= 12).length;
      bid += Math.max(0, spadesHeld.length - 3);
      return { type: "bid", bid: Math.max(1, Math.min(13, Math.round(bid))) };
    }
    if (state.phase !== "play") return null;
    const options = legal(state, player);
    if (state.trick.length === 0) {
      const nonSpade = options.filter((c) => suitOf(c) !== "S");
      const aces = nonSpade.filter((c) => rankOf(c) === "A");
      return { type: "play", card: aces[0] ?? lowest(nonSpade.length ? nonSpade : options) };
    }
    const currentWinner = trickWinner(state.trick, "S").player;
    const partnerWinning = state.teamOf[currentWinner] === state.teamOf[player] && state.teams === 2;
    if (partnerWinning) return { type: "play", card: lowest(options) };
    const winners = winningOptions(options, state.trick, "S", player);
    if (winners.length) return { type: "play", card: lowest(winners) };
    return { type: "play", card: lowest(options) };
  },

  isOver: (state) => state.phase === "over",
  results: (state, ctx) => resultsFromScores(playerScores(state), ctx, { order: state.players }),
  roundSummaries: (state) => state.summaries,

  publicView(state): SpadesPublic {
    return {
      players: state.players,
      teamOf: state.teamOf,
      teams: state.teams,
      phase: state.phase,
      bids: state.bids,
      handCounts: Object.fromEntries(state.players.map((p) => [p, state.hands[p]!.length])),
      trick: state.trick,
      lastTrick: state.lastTrick,
      turn: state.turn,
      tricksWon: state.tricksWon,
      spadesBroken: state.spadesBroken,
      round: state.round,
      teamScores: state.teamScores,
      teamBags: state.teamBags,
      scores: playerScores(state),
      log: state.log,
    };
  },
  privateView(state, player): SpadesPrivate | null {
    const hand = state.hands[player];
    if (!hand) return null;
    return { hand: sortHand(hand), legal: legal(state, player) };
  },
};

export interface SpadesPublic {
  players: PlayerId[];
  teamOf: Record<PlayerId, number>;
  teams: number;
  phase: SpadesState["phase"];
  bids: Record<PlayerId, number | null>;
  handCounts: Record<PlayerId, number>;
  trick: TrickPlay[];
  lastTrick: SpadesState["lastTrick"];
  turn: PlayerId;
  tricksWon: Record<PlayerId, number>;
  spadesBroken: boolean;
  round: number;
  teamScores: number[];
  teamBags: number[];
  scores: Record<PlayerId, number>;
  log: string[];
}
export interface SpadesPrivate {
  hand: CardId[];
  legal: CardId[];
}
