import { z } from "zod";
import { type CardId, type Rank, RANK_NAMES, cardLabel, deal, rankOf, shuffledDeck, suitOf } from "@/lib/engine/cards";
import { REVEAL_SECONDS, deadlineFrom, nameOf, pushLog, resultsFromScores, zeroScores } from "@/lib/engine/helpers";
import type { GameContext, GameModule, PlayerId, RoundSummary } from "@/lib/engine/types";
import { autoPlayPending } from "../shared/auto";
import { cardSchema } from "../shared/schemas";

/** Rank order for President: 3 is lowest, 2 is highest. */
const ORDER: Rank[] = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];
export const presRank = (c: CardId) => ORDER.indexOf(rankOf(c));
const SUIT_ORDER = { C: 0, D: 1, H: 2, S: 3 } as const;
export const sortPres = (cards: CardId[]) =>
  cards.slice().sort((a, b) => presRank(a) - presRank(b) || SUIT_ORDER[suitOf(a)] - SUIT_ORDER[suitOf(b)]);

export interface PresidentState {
  players: PlayerId[];
  hands: Record<PlayerId, CardId[]>;
  pile: { player: PlayerId; cards: CardId[] } | null;
  passed: PlayerId[];
  finished: PlayerId[];
  turn: PlayerId;
  phase: "play" | "roundEnd" | "over";
  round: number;
  titles: Record<PlayerId, string>;
  scores: Record<PlayerId, number>;
  summaries: RoundSummary[];
  deadline: number | null;
  log: string[];
}

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("play"), cards: z.array(cardSchema).min(1).max(4) }),
  z.object({ type: z.literal("pass") }),
  z.object({ type: z.literal("next") }),
]);
type Action = z.infer<typeof actionSchema>;

function titleFor(place: number, n: number) {
  if (place === 0) return "President";
  if (place === n - 1) return "Scum";
  if (place === 1 && n > 3) return "Vice President";
  if (place === n - 2 && n > 3) return "Vice Scum";
  return "Citizen";
}

function active(state: PresidentState) {
  return state.players.filter((p) => !state.finished.includes(p));
}

function nextActive(state: PresidentState, from: PlayerId, skipPassed = true): PlayerId | null {
  const n = state.players.length;
  const i = state.players.indexOf(from);
  for (let k = 1; k <= n; k++) {
    const p = state.players[(i + k) % n]!;
    if (state.finished.includes(p)) continue;
    if (skipPassed && state.passed.includes(p)) continue;
    return p;
  }
  return null;
}

function dealRound(players: PlayerId[], round: number, ctx: GameContext, prev?: PresidentState): PresidentState {
  const { hands } = deal(shuffledDeck(ctx.rng), players.length, "all");
  const map: Record<PlayerId, CardId[]> = Object.fromEntries(players.map((p, i) => [p, hands[i]!]));
  const log: string[] = prev?.log ?? [];
  let first = players.find((p) => map[p]!.includes("3C"))!;
  const lines: string[] = [];
  if (prev && prev.finished.length === players.length) {
    // The Scum hands their best card to the President, who returns their worst.
    const president = prev.finished[0]!;
    const scum = prev.finished[players.length - 1]!;
    const best = sortPres(map[scum]!).at(-1)!;
    map[scum] = map[scum]!.filter((c) => c !== best);
    map[president] = [...map[president]!, best];
    const worst = sortPres(map[president]!)[0]!;
    map[president] = map[president]!.filter((c) => c !== worst);
    map[scum] = [...map[scum]!, worst];
    lines.push(`${nameOf(ctx, scum)} gave their best card to ${nameOf(ctx, president)} and got one back.`);
    first = scum;
  }
  return {
    players,
    hands: map,
    pile: null,
    passed: [],
    finished: [],
    turn: first,
    phase: "play",
    round,
    titles: prev?.titles ?? {},
    scores: prev?.scores ?? zeroScores(players),
    summaries: prev?.summaries ?? [],
    deadline: deadlineFrom(ctx.now, ctx.config.turnSeconds),
    log: pushLog(log, `Round ${round} — ${nameOf(ctx, first)} leads.`, ...lines),
  };
}

/** After someone plays or passes, work out who acts next and clear the pile when everyone else has passed. */
function advanceTurn(state: PresidentState, from: PlayerId, ctx: GameContext): PresidentState {
  let s = state;
  const stillIn = active(s);
  if (stillIn.length <= 1) return finishRound(s, ctx);
  const contenders = stillIn.filter((p) => !s.passed.includes(p));
  const leader = s.pile?.player;
  const othersPassed = leader !== undefined && contenders.every((p) => p === leader);
  if (othersPassed || contenders.length === 0) {
    // Pile clears. The last player to play leads (or the next active player if they went out).
    const lead = leader && !s.finished.includes(leader) ? leader : nextActive({ ...s, passed: [] }, leader ?? from, false)!;
    s = { ...s, pile: null, passed: [], turn: lead, log: pushLog(s.log, `Pile cleared — ${nameOf(ctx, lead)} leads.`) };
  } else {
    s = { ...s, turn: nextActive(s, from)! };
  }
  return { ...s, deadline: deadlineFrom(ctx.now, ctx.config.turnSeconds) };
}

function finishRound(state: PresidentState, ctx: GameContext): PresidentState {
  const finished = [...state.finished, ...active(state)];
  const n = state.players.length;
  const gained = Object.fromEntries(finished.map((p, i) => [p, n - 1 - i]));
  const scores = Object.fromEntries(state.players.map((p) => [p, (state.scores[p] ?? 0) + gained[p]!]));
  const titles = Object.fromEntries(finished.map((p, i) => [p, titleFor(i, n)]));
  const summary: RoundSummary = {
    round: state.round,
    title: `${nameOf(ctx, finished[0]!)} is President!`,
    lines: finished.map((p, i) => `${titles[p]}: ${nameOf(ctx, p)} (+${n - 1 - i})`),
    scores: gained,
  };
  const over = state.round >= ctx.config.rounds;
  return {
    ...state,
    finished,
    titles,
    scores,
    summaries: [...state.summaries, summary],
    phase: over ? "over" : "roundEnd",
    deadline: over ? null : deadlineFrom(ctx.now, REVEAL_SECONDS),
    log: pushLog(state.log, summary.title),
  };
}

function canBeat(state: PresidentState, cards: CardId[]): string | null {
  if (new Set(cards.map(rankOf)).size !== 1) return "All cards you play must be the same rank.";
  if (!state.pile) return null;
  if (cards.length !== state.pile.cards.length)
    return `Play exactly ${state.pile.cards.length} card${state.pile.cards.length > 1 ? "s" : ""}.`;
  if (presRank(cards[0]!) <= presRank(state.pile.cards[0]!)) return "Your cards must be higher than the pile.";
  return null;
}

/** All legal plays for a hand, grouped by rank. */
export function presidentOptions(state: PresidentState, player: PlayerId): CardId[][] {
  const hand = sortPres(state.hands[player] ?? []);
  const byRank = new Map<Rank, CardId[]>();
  for (const c of hand) byRank.set(rankOf(c), [...(byRank.get(rankOf(c)) ?? []), c]);
  const out: CardId[][] = [];
  for (const cards of byRank.values()) {
    if (!state.pile) out.push(cards);
    else if (cards.length >= state.pile.cards.length && presRank(cards[0]!) > presRank(state.pile.cards[0]!)) {
      out.push(cards.slice(0, state.pile.cards.length));
    }
  }
  return out;
}

export const president: GameModule<PresidentState, Action> = {
  meta: {
    id: "president",
    name: "President",
    tagline: "Climb from Scum to President by shedding cards first.",
    category: "card",
    minPlayers: 3,
    maxPlayers: 7,
    duration: "15–30 min",
    icon: "Crown",
    accent: "amber",
    supportsBots: true,
    rules: {
      goal: "Get rid of your cards first to become President.",
      steps: [
        "All cards are dealt. Card order from low to high: 3, 4 … K, A, 2.",
        "The leader plays one card, or a pair, triple or four of a kind.",
        "Each next player must play the same number of cards of a higher rank — or pass.",
        "Once you pass you're out until the pile is cleared. When everyone else has passed, the pile clears and the last player to play leads again.",
        "Players drop out as their hands empty. Titles go from President down to Scum.",
        "Next round, the Scum gives their best card to the President, gets back the President's worst, and leads.",
      ],
      scoring:
        "Each round, first out scores one less than the number of players, second out one less again, and so on down to 0.",
      ending: "Highest total after the set number of rounds wins; ties share the win.",
    },
  },
  settings: ["rounds", "turnSeconds"],
  presets: {
    quick: { rounds: 1, turnSeconds: 20 },
    standard: { rounds: 3, turnSeconds: 30 },
    long: { rounds: 6, turnSeconds: 45 },
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
    if (action.type === "pass") return state.pile ? null : "You're leading — play something.";
    const hand = state.hands[player]!;
    if (new Set(action.cards).size !== action.cards.length || !action.cards.every((c) => hand.includes(c))) {
      return "You don't have those cards.";
    }
    return canBeat(state, action.cards);
  },

  apply(state, player, action, ctx) {
    if (action.type === "next") return dealRound(state.players, state.round + 1, ctx, state);
    if (action.type === "pass") {
      return advanceTurn(
        { ...state, passed: [...state.passed, player], log: pushLog(state.log, `${nameOf(ctx, player)} passed.`) },
        player,
        ctx,
      );
    }
    const hand = state.hands[player]!.filter((c) => !action.cards.includes(c));
    let s: PresidentState = {
      ...state,
      hands: { ...state.hands, [player]: hand },
      pile: { player, cards: action.cards },
      log: pushLog(state.log, `${nameOf(ctx, player)} played ${action.cards.map(cardLabel).join(" ")}.`),
    };
    if (hand.length === 0) {
      s = {
        ...s,
        finished: [...s.finished, player],
        log: pushLog(s.log, `${nameOf(ctx, player)} is out! (#${s.finished.length + 1})`),
      };
    }
    return advanceTurn(s, player, ctx);
  },

  pending: (state) => (state.phase === "play" ? [state.turn] : []),
  deadline: (state) => (state.phase === "over" ? null : state.deadline),
  onTimeout(state, ctx) {
    if (state.phase === "roundEnd") return dealRound(state.players, state.round + 1, ctx, state);
    return autoPlayPending(president, state, ctx);
  },
  botAction(state, player) {
    if (state.phase !== "play" || state.turn !== player) return null;
    const options = presidentOptions(state, player);
    if (!options.length) return { type: "pass" };
    if (!state.pile) return { type: "play", cards: options[0]! };
    // Don't waste 2s early unless it goes out.
    const pick =
      options.find((o) => rankOf(o[0]!) !== "2") ??
      (state.hands[player]!.length <= options[0]!.length + 1 ? options[0] : undefined);
    return pick ? { type: "play", cards: pick } : { type: "pass" };
  },

  isOver: (state) => state.phase === "over",
  results: (state, ctx) => resultsFromScores(state.scores, ctx, { order: state.players }),
  roundSummaries: (state) => state.summaries,

  publicView(state): PresidentPublic {
    return {
      players: state.players,
      handCounts: Object.fromEntries(state.players.map((p) => [p, state.hands[p]!.length])),
      pile: state.pile,
      passed: state.passed,
      finished: state.finished,
      turn: state.turn,
      phase: state.phase,
      round: state.round,
      titles: state.titles,
      scores: state.scores,
      log: state.log,
      pileRankName: state.pile ? RANK_NAMES[rankOf(state.pile.cards[0]!)] : null,
    };
  },
  privateView(state, player): PresidentPrivate | null {
    const hand = state.hands[player];
    if (!hand) return null;
    return {
      hand: sortPres(hand),
      options: state.turn === player && state.phase === "play" ? presidentOptions(state, player) : [],
    };
  },
};

export interface PresidentPublic {
  players: PlayerId[];
  handCounts: Record<PlayerId, number>;
  pile: PresidentState["pile"];
  passed: PlayerId[];
  finished: PlayerId[];
  turn: PlayerId;
  phase: PresidentState["phase"];
  round: number;
  titles: Record<PlayerId, string>;
  scores: Record<PlayerId, number>;
  log: string[];
  pileRankName: string | null;
}
export interface PresidentPrivate {
  hand: CardId[];
  options: CardId[][];
}
