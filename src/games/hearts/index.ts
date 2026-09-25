import { z } from "zod";
import { type CardId, deal, rankValue, shuffledDeck, sortHand, suitOf } from "@/lib/engine/cards";
import { REVEAL_SECONDS, deadlineFrom, nameOf, nextPlayer, pushLog, resultsFromScores, zeroScores } from "@/lib/engine/helpers";
import type { GameContext, GameModule, PlayerId, RoundSummary } from "@/lib/engine/types";
import { autoPlayPending } from "../shared/auto";
import { cardSchema } from "../shared/schemas";
import { type TrickPlay, highest, legalTrickPlays, lowest, trickWinner, winningOptions } from "../shared/tricks";

type PassDir = "left" | "right" | "across" | "none";
const PASS_ORDER: PassDir[] = ["left", "right", "across", "none"];

export interface HeartsState {
  players: PlayerId[];
  hands: Record<PlayerId, CardId[]>;
  phase: "pass" | "play" | "roundEnd" | "over";
  passDir: PassDir;
  passes: Record<PlayerId, CardId[] | null>;
  received: Record<PlayerId, CardId[]>;
  trick: TrickPlay[];
  lastTrick: { plays: TrickPlay[]; winner: PlayerId } | null;
  turn: PlayerId;
  taken: Record<PlayerId, CardId[]>;
  tricksWon: Record<PlayerId, number>;
  heartsBroken: boolean;
  firstTrick: boolean;
  round: number;
  scores: Record<PlayerId, number>;
  summaries: RoundSummary[];
  deadline: number | null;
  log: string[];
}

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pass"), cards: z.array(cardSchema).length(3) }),
  z.object({ type: z.literal("play"), card: cardSchema }),
  z.object({ type: z.literal("next") }),
]);
type Action = z.infer<typeof actionSchema>;

export const pointsOf = (card: CardId) => (suitOf(card) === "H" ? 1 : card === "QS" ? 13 : 0);

function passTarget(players: PlayerId[], p: PlayerId, dir: PassDir): PlayerId {
  const i = players.indexOf(p);
  const n = players.length;
  const offset = dir === "left" ? 1 : dir === "right" ? n - 1 : 2;
  return players[(i + offset) % n]!;
}

function holderOf(hands: Record<PlayerId, CardId[]>, card: CardId): PlayerId {
  return Object.entries(hands).find(([, h]) => h.includes(card))![0];
}

function dealRound(players: PlayerId[], round: number, ctx: GameContext, prev?: HeartsState): HeartsState {
  const { hands } = deal(shuffledDeck(ctx.rng), 4, 13);
  const passDir = PASS_ORDER[(round - 1) % 4]!;
  const handMap = Object.fromEntries(players.map((p, i) => [p, hands[i]!]));
  const base: HeartsState = {
    players,
    hands: handMap,
    phase: passDir === "none" ? "play" : "pass",
    passDir,
    passes: Object.fromEntries(players.map((p) => [p, null])),
    received: Object.fromEntries(players.map((p) => [p, []])),
    trick: [],
    lastTrick: null,
    turn: holderOf(handMap, "2C"),
    taken: Object.fromEntries(players.map((p) => [p, []])),
    tricksWon: zeroScores(players),
    heartsBroken: false,
    firstTrick: true,
    round,
    scores: prev?.scores ?? zeroScores(players),
    summaries: prev?.summaries ?? [],
    deadline: null,
    log: pushLog(
      prev?.log ?? [],
      `Round ${round}: ${passDir === "none" ? "no passing this round" : `pass three cards ${passDir}`}.`,
    ),
  };
  const seconds = ctx.config.turnSeconds;
  base.deadline = deadlineFrom(ctx.now, base.phase === "pass" ? Math.max(seconds * 2, seconds && 30) : seconds);
  return base;
}

function legal(state: HeartsState, player: PlayerId): CardId[] {
  if (state.phase !== "play" || state.turn !== player) return [];
  const hand = state.hands[player]!;
  let options = legalTrickPlays(hand, state.trick, {
    restrictedLeadSuit: "H",
    broken: state.heartsBroken,
    mustLead: state.firstTrick ? "2C" : null,
  });
  // No points on the first trick when you have a choice.
  if (state.firstTrick && state.trick.length > 0) {
    const safe = options.filter((c) => pointsOf(c) === 0);
    if (safe.length) options = safe;
  }
  return options;
}

function finishRound(state: HeartsState, ctx: GameContext): HeartsState {
  const pts = Object.fromEntries(state.players.map((p) => [p, state.taken[p]!.reduce((s, c) => s + pointsOf(c), 0)]));
  const shooter = state.players.find((p) => pts[p] === 26);
  const roundScores = shooter ? Object.fromEntries(state.players.map((p) => [p, p === shooter ? 0 : 26])) : pts;
  const scores = Object.fromEntries(state.players.map((p) => [p, (state.scores[p] ?? 0) + roundScores[p]!]));
  const summary: RoundSummary = {
    round: state.round,
    title: shooter ? `${nameOf(ctx, shooter)} shot the moon!` : "Round complete",
    lines: state.players.map((p) => `${nameOf(ctx, p)}: +${roundScores[p]} (total ${scores[p]})`),
    scores: roundScores,
  };
  const over = state.round >= ctx.config.rounds || Object.values(scores).some((s) => s >= ctx.config.targetScore);
  return {
    ...state,
    scores,
    summaries: [...state.summaries, summary],
    phase: over ? "over" : "roundEnd",
    deadline: over ? null : deadlineFrom(ctx.now, REVEAL_SECONDS),
    log: pushLog(state.log, summary.title),
  };
}

export const hearts: GameModule<HeartsState, Action> = {
  meta: {
    id: "hearts",
    name: "Hearts",
    tagline: "Dodge the hearts and the Queen of Spades.",
    category: "card",
    minPlayers: 4,
    maxPlayers: 4,
    duration: "20–40 min",
    icon: "Heart",
    accent: "rose",
    lowerIsBetter: true,
    supportsBots: true,
    rules: {
      goal: "Take as few penalty points as possible.",
      steps: [
        "Four players get 13 cards each. Add bots if you have fewer than four people.",
        "Before each round, pass three cards: left, then right, then across, then no pass.",
        "Whoever has the 2♣ leads it. Everyone must follow the led suit if they can.",
        "The highest card of the led suit wins the trick; the winner leads next.",
        "You can't lead hearts until a heart has been played (unless you only have hearts).",
        "Point cards can't be played on the very first trick unless you have nothing else.",
      ],
      scoring:
        "Each heart is 1 point and the Queen of Spades is 13. Take all 26 (“shoot the moon”) and everyone else gets 26 instead.",
      ending:
        "The game ends after the set number of rounds or when anyone reaches the limit. Lowest total wins; equal totals share the win.",
    },
  },
  settings: ["rounds", "targetScore", "turnSeconds"],
  presets: {
    quick: { rounds: 1, targetScore: 50, turnSeconds: 20 },
    standard: { rounds: 4, targetScore: 100, turnSeconds: 30 },
    long: { rounds: 12, targetScore: 100, turnSeconds: 45 },
  },
  actionSchema,

  setup: (players, ctx) => dealRound(players, 1, ctx),

  validate(state, player, action, ctx) {
    if (action.type === "next") {
      if (state.phase !== "roundEnd") return "Nothing to continue.";
      return player === ctx.hostId ? null : "Only the host can continue.";
    }
    if (action.type === "pass") {
      if (state.phase !== "pass") return "It's not time to pass cards.";
      if (state.passes[player]) return "You've already passed your cards.";
      const hand = state.hands[player] ?? [];
      if (new Set(action.cards).size !== 3 || !action.cards.every((c) => hand.includes(c)))
        return "Pick three of your own cards.";
      return null;
    }
    if (state.phase !== "play") return "Wait for the round to start.";
    if (state.turn !== player) return "It's not your turn.";
    if (!state.hands[player]!.includes(action.card)) return "You don't have that card.";
    if (!legal(state, player).includes(action.card)) {
      if (state.firstTrick && state.trick.length === 0) return "The 2♣ must lead the first trick.";
      if (state.trick.length && state.hands[player]!.some((c) => suitOf(c) === suitOf(state.trick[0]!.card))) {
        return "You must follow the led suit.";
      }
      if (state.trick.length === 0) return "Hearts haven't been broken yet.";
      return "You can't play points on the first trick.";
    }
    return null;
  },

  apply(state, player, action, ctx) {
    if (action.type === "next") return dealRound(state.players, state.round + 1, ctx, state);
    if (action.type === "pass") {
      const passes = { ...state.passes, [player]: action.cards };
      if (Object.values(passes).some((p) => !p)) return { ...state, passes };
      const hands = { ...state.hands };
      const received: Record<PlayerId, CardId[]> = {};
      for (const p of state.players) hands[p] = hands[p]!.filter((c) => !passes[p]!.includes(c));
      for (const p of state.players) {
        const to = passTarget(state.players, p, state.passDir);
        hands[to] = [...hands[to]!, ...passes[p]!];
        received[to] = passes[p]!;
      }
      return {
        ...state,
        hands,
        passes,
        received,
        phase: "play",
        turn: holderOf(hands, "2C"),
        deadline: deadlineFrom(ctx.now, ctx.config.turnSeconds),
        log: pushLog(state.log, "Cards passed. The 2♣ leads."),
      };
    }
    const hand = state.hands[player]!.filter((c) => c !== action.card);
    const trick = [...state.trick, { player, card: action.card }];
    let next: HeartsState = {
      ...state,
      hands: { ...state.hands, [player]: hand },
      trick,
      heartsBroken: state.heartsBroken || suitOf(action.card) === "H",
      deadline: deadlineFrom(ctx.now, ctx.config.turnSeconds),
    };
    if (trick.length < 4) return { ...next, turn: nextPlayer(state.players, player) };
    const winner = trickWinner(trick, null).player;
    const pts = trick.reduce((s, t) => s + pointsOf(t.card), 0);
    next = {
      ...next,
      trick: [],
      lastTrick: { plays: trick, winner },
      taken: { ...next.taken, [winner]: [...next.taken[winner]!, ...trick.map((t) => t.card)] },
      tricksWon: { ...next.tricksWon, [winner]: next.tricksWon[winner]! + 1 },
      turn: winner,
      firstTrick: false,
      log: pushLog(state.log, `${nameOf(ctx, winner)} took the trick${pts ? ` (+${pts})` : ""}.`),
    };
    if (Object.values(next.hands).every((h) => h.length === 0)) return finishRound(next, ctx);
    return next;
  },

  pending(state) {
    if (state.phase === "pass") return state.players.filter((p) => !state.passes[p]);
    if (state.phase === "play") return [state.turn];
    return [];
  },
  deadline: (state) => (state.phase === "over" ? null : state.deadline),
  onTimeout(state, ctx) {
    if (state.phase === "roundEnd") return dealRound(state.players, state.round + 1, ctx, state);
    return autoPlayPending(hearts, state, ctx);
  },

  botAction(state, player) {
    const hand = state.hands[player] ?? [];
    if (state.phase === "pass") {
      if (state.passes[player]) return null;
      const danger = (c: CardId) =>
        (c === "QS" ? 100 : c === "AS" || c === "KS" ? 90 : 0) + (suitOf(c) === "H" ? 20 : 0) + rankValue(c, true);
      return {
        type: "pass",
        cards: hand
          .slice()
          .sort((a, b) => danger(b) - danger(a))
          .slice(0, 3),
      };
    }
    if (state.phase !== "play" || state.turn !== player) return null;
    const options = legal(state, player);
    if (state.trick.length === 0) return { type: "play", card: lowest(options) };
    const leadSuit = suitOf(state.trick[0]!.card);
    const following = options.some((c) => suitOf(c) === leadSuit);
    if (following) {
      const winners = new Set(winningOptions(options, state.trick, null, player));
      const safe = options.filter((c) => !winners.has(c));
      return {
        type: "play",
        card: safe.length
          ? highest(safe)
          : state.trick.length === 3 && !state.trick.some((t) => pointsOf(t.card))
            ? highest(options)
            : lowest(options),
      };
    }
    if (options.includes("QS")) return { type: "play", card: "QS" };
    const heartsHeld = options.filter((c) => suitOf(c) === "H");
    return { type: "play", card: heartsHeld.length ? highest(heartsHeld) : highest(options) };
  },

  isOver: (state) => state.phase === "over",
  results: (state, ctx) => resultsFromScores(state.scores, ctx, { lowerIsBetter: true, order: state.players }),
  roundSummaries: (state) => state.summaries,

  publicView(state): HeartsPublic {
    return {
      players: state.players,
      phase: state.phase,
      passDir: state.passDir,
      passed: state.players.filter((p) => !!state.passes[p]),
      handCounts: Object.fromEntries(state.players.map((p) => [p, state.hands[p]!.length])),
      trick: state.trick,
      lastTrick: state.lastTrick,
      turn: state.turn,
      tricksWon: state.tricksWon,
      roundPoints: Object.fromEntries(state.players.map((p) => [p, state.taken[p]!.reduce((s, c) => s + pointsOf(c), 0)])),
      heartsBroken: state.heartsBroken,
      round: state.round,
      scores: state.scores,
      log: state.log,
    };
  },

  privateView(state, player): HeartsPrivate | null {
    const hand = state.hands[player];
    if (!hand) return null;
    return {
      hand: sortHand(hand),
      legal: legal(state, player),
      passed: state.phase === "pass" ? (state.passes[player] ?? null) : null,
      received: state.phase === "play" && state.firstTrick ? (state.received[player] ?? []) : [],
      passTo: state.phase === "pass" ? passTarget(state.players, player, state.passDir) : null,
    };
  },
};

export interface HeartsPublic {
  players: PlayerId[];
  phase: HeartsState["phase"];
  passDir: PassDir;
  passed: PlayerId[];
  handCounts: Record<PlayerId, number>;
  trick: TrickPlay[];
  lastTrick: HeartsState["lastTrick"];
  turn: PlayerId;
  tricksWon: Record<PlayerId, number>;
  roundPoints: Record<PlayerId, number>;
  heartsBroken: boolean;
  round: number;
  scores: Record<PlayerId, number>;
  log: string[];
}
export interface HeartsPrivate {
  hand: CardId[];
  legal: CardId[];
  passed: CardId[] | null;
  received: CardId[];
  passTo: PlayerId | null;
}
