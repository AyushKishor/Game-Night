import { z } from "zod";
import { type CardId, cardLabel, rankOf, shuffledDeck } from "@/lib/engine/cards";
import { REVEAL_SECONDS, deadlineFrom, nameOf, pushLog, resultsFromScores, zeroScores } from "@/lib/engine/helpers";
import type { GameContext, GameModule, PlayerId, RoundSummary } from "@/lib/engine/types";
import { SIP_RULE } from "../shared/party";

type Status = "playing" | "stood" | "bust" | "twentyone";

export interface TwentyOneState {
  players: PlayerId[];
  deck: CardId[];
  hands: Record<PlayerId, CardId[]>;
  status: Record<PlayerId, Status>;
  dealer: CardId[];
  phase: "act" | "reveal" | "over";
  round: number;
  scores: Record<PlayerId, number>;
  outcomes: Record<PlayerId, "win" | "push" | "lose" | "natural"> | null;
  summaries: RoundSummary[];
  deadline: number | null;
  log: string[];
}

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hit") }),
  z.object({ type: z.literal("stand") }),
  z.object({ type: z.literal("next") }),
]);
type Action = z.infer<typeof actionSchema>;

/** Best total: aces count 11 unless that would bust. */
export function handTotal(cards: CardId[]): number {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const r = rankOf(c);
    if (r === "A") {
      aces++;
      total += 11;
    } else if (r === "K" || r === "Q" || r === "J") total += 10;
    else total += Number(r);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function dealRound(players: PlayerId[], round: number, ctx: GameContext, prev?: TwentyOneState): TwentyOneState {
  const deck = shuffledDeck(ctx.rng);
  const hands: Record<PlayerId, CardId[]> = {};
  players.forEach((p, i) => (hands[p] = [deck[i * 2]!, deck[i * 2 + 1]!]));
  const used = players.length * 2;
  const status = Object.fromEntries(players.map((p) => [p, handTotal(hands[p]!) === 21 ? "twentyone" : "playing"])) as Record<PlayerId, Status>;
  const s: TwentyOneState = {
    players,
    deck: deck.slice(used + 2),
    hands,
    status,
    dealer: [deck[used]!, deck[used + 1]!],
    phase: "act",
    round,
    scores: prev?.scores ?? zeroScores(players),
    outcomes: null,
    summaries: prev?.summaries ?? [],
    deadline: deadlineFrom(ctx.now, ctx.config.roundSeconds),
    log: pushLog(prev?.log ?? [], `Round ${round}: cards are out.`),
  };
  return players.every((p) => s.status[p] !== "playing") ? settle(s, ctx) : s;
}

function settle(state: TwentyOneState, ctx: GameContext): TwentyOneState {
  let dealer = state.dealer;
  let deck = state.deck;
  const anyAlive = state.players.some((p) => state.status[p] !== "bust");
  while (anyAlive && handTotal(dealer) < 17) {
    dealer = [...dealer, deck[0]!];
    deck = deck.slice(1);
  }
  const d = handTotal(dealer);
  const outcomes: TwentyOneState["outcomes"] = {};
  const gained: Record<PlayerId, number> = {};
  for (const p of state.players) {
    const t = handTotal(state.hands[p]!);
    const natural = t === 21 && state.hands[p]!.length === 2;
    let o: "win" | "push" | "lose" | "natural";
    if (t > 21) o = "lose";
    else if (natural && !(d === 21 && dealer.length === 2)) o = "natural";
    else if (d > 21 || t > d) o = "win";
    else if (t === d) o = "push";
    else o = "lose";
    outcomes[p] = o;
    gained[p] = { natural: 3, win: 2, push: 1, lose: 0 }[o];
  }
  const scores = Object.fromEntries(state.players.map((p) => [p, state.scores[p]! + gained[p]!]));
  const summary: RoundSummary = {
    round: state.round,
    title: `Dealer ${d > 21 ? "went bust" : `stands on ${d}`}`,
    lines: state.players.map((p) => `${nameOf(ctx, p)}: ${handTotal(state.hands[p]!)} — ${outcomes[p]} (+${gained[p]})`),
    scores: gained,
  };
  return {
    ...state,
    dealer,
    deck,
    phase: "reveal",
    outcomes,
    scores,
    summaries: [...state.summaries, summary],
    deadline: ctx.now + REVEAL_SECONDS * 1000,
    log: pushLog(state.log, `${summary.title}. Dealer shows ${dealer.map(cardLabel).join(" ")}.`),
  };
}

export const twentyOne: GameModule<TwentyOneState, Action> = {
  meta: {
    id: "twenty-one",
    name: "Twenty-One",
    tagline: "Get closer to 21 than the dealer — just for points.",
    category: "card",
    minPlayers: 1,
    maxPlayers: 7,
    duration: "10–15 min",
    icon: "Target",
    accent: "coral",
    supportsBots: true,
    rules: {
      goal: "Beat the dealer's total without going over 21.",
      steps: [
        "Everyone gets two face-up cards. The dealer gets one face-up and one face-down card.",
        "Number cards count their number, face cards 10, aces 1 or 11.",
        "Everyone plays at the same time: Hit to take a card, Stand to stop. Over 21 is bust.",
        "When everyone has stood or bust, the dealer reveals and draws until reaching at least 17.",
        "There's no betting — you just score points.",
      ],
      scoring: "Two-card 21 that the dealer doesn't match: 3 points. Beat the dealer: 2. Tie: 1. Lose or bust: 0.",
      ending: "Most points after the set number of rounds wins; ties share the win.",
    },
  },
  settings: ["rounds", "roundSeconds"],
  houseRules: [SIP_RULE],
  presets: { quick: { rounds: 3, roundSeconds: 30 }, standard: { rounds: 6, roundSeconds: 45 }, long: { rounds: 10, roundSeconds: 60 } },
  actionSchema,

  setup: (players, ctx) => dealRound(players, 1, ctx),

  validate(state, player, action, ctx) {
    if (action.type === "next") {
      if (state.phase !== "reveal") return "Nothing to continue.";
      return player === ctx.hostId ? null : "Only the host can continue.";
    }
    if (state.phase !== "act") return "Wait for the next round.";
    if (state.status[player] !== "playing") return "You're done for this round.";
    return null;
  },

  apply(state, player, action, ctx) {
    if (action.type === "next") {
      return state.round >= ctx.config.rounds ? { ...state, phase: "over", deadline: null } : dealRound(state.players, state.round + 1, ctx, state);
    }
    let s = state;
    if (action.type === "hit") {
      const hand = [...state.hands[player]!, state.deck[0]!];
      const t = handTotal(hand);
      s = {
        ...state,
        deck: state.deck.slice(1),
        hands: { ...state.hands, [player]: hand },
        status: { ...state.status, [player]: t > 21 ? "bust" : t === 21 ? "twentyone" : "playing" },
        log: t > 21 ? pushLog(state.log, `${nameOf(ctx, player)} went bust with ${t}.`) : state.log,
      };
    } else {
      s = { ...state, status: { ...state.status, [player]: "stood" } };
    }
    return s.players.every((p) => s.status[p] !== "playing") ? settle(s, ctx) : s;
  },

  pending: (state) => (state.phase === "act" ? state.players.filter((p) => state.status[p] === "playing") : []),
  deadline: (state) => (state.phase === "over" ? null : state.deadline),
  onTimeout(state, ctx) {
    if (state.phase === "reveal") return twentyOne.apply(state, ctx.hostId, { type: "next" }, ctx);
    // Anyone still deciding stands.
    const status = Object.fromEntries(state.players.map((p) => [p, state.status[p] === "playing" ? "stood" : state.status[p]!])) as Record<PlayerId, Status>;
    return settle({ ...state, status }, ctx);
  },
  botAction(state, player, ctx) {
    if (state.phase !== "act" || state.status[player] !== "playing") return null;
    const limit = { easy: 15, normal: 17, hard: 17 }[ctx.config.difficulty];
    return handTotal(state.hands[player]!) < limit ? { type: "hit" } : { type: "stand" };
  },

  isOver: (state) => state.phase === "over",
  results: (state, ctx) => resultsFromScores(state.scores, ctx, { order: state.players }),
  roundSummaries: (state) => state.summaries,

  publicView(state): TwentyOnePublic {
    const revealed = state.phase !== "act";
    return {
      players: state.players,
      hands: state.hands,
      totals: Object.fromEntries(state.players.map((p) => [p, handTotal(state.hands[p]!)])),
      status: state.status,
      dealer: revealed ? state.dealer : [state.dealer[0]!],
      dealerHidden: revealed ? 0 : 1,
      dealerTotal: revealed ? handTotal(state.dealer) : null,
      phase: state.phase,
      round: state.round,
      scores: state.scores,
      outcomes: state.outcomes,
      log: state.log,
    };
  },
  privateView: () => null,
};

export interface TwentyOnePublic {
  players: PlayerId[];
  hands: Record<PlayerId, CardId[]>;
  totals: Record<PlayerId, number>;
  status: Record<PlayerId, Status>;
  dealer: CardId[];
  dealerHidden: number;
  dealerTotal: number | null;
  phase: TwentyOneState["phase"];
  round: number;
  scores: Record<PlayerId, number>;
  outcomes: TwentyOneState["outcomes"];
  log: string[];
}
