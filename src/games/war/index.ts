import { z } from "zod";
import { type CardId, cardLabel, deal, rankValue, shuffledDeck } from "@/lib/engine/cards";
import { deadlineFrom, nameOf, pushLog, resultsFromScores } from "@/lib/engine/helpers";
import type { GameModule, PlayerId } from "@/lib/engine/types";
import { autoPlayPending } from "../shared/auto";

export interface WarState {
  players: PlayerId[];
  piles: Record<PlayerId, CardId[]>;
  /** Players contesting the current battle (everyone, or the tied players during a war). */
  contenders: PlayerId[];
  flips: Record<PlayerId, CardId | null>;
  pot: CardId[];
  atWar: boolean;
  battle: number;
  maxBattles: number;
  over: boolean;
  deadline: number | null;
  last: { flips: Record<PlayerId, CardId>; winner: PlayerId | null; war: boolean } | null;
  log: string[];
}

const actionSchema = z.object({ type: z.literal("flip") });
type Action = z.infer<typeof actionSchema>;

function withCards(state: WarState) {
  return state.players.filter((p) => state.piles[p]!.length > 0);
}

export const war: GameModule<WarState, Action> = {
  meta: {
    id: "war",
    name: "War",
    tagline: "Flip together. Highest card takes them all.",
    category: "card",
    minPlayers: 2,
    maxPlayers: 4,
    duration: "5–15 min",
    icon: "Swords",
    accent: "coral",
    supportsBots: true,
    rules: {
      goal: "Win the most cards.",
      steps: [
        "The whole deck is dealt face down into everyone's piles.",
        "Each battle, everyone taps Flip to turn over their top card.",
        "The highest card (aces high) wins every flipped card.",
        "If the top cards tie, it's war: the tied players put up to three cards face down, then flip again. The winner takes the whole pot.",
        "Players with no cards are out.",
      ],
      scoring: "Your score is the number of cards in your pile at the end.",
      ending: "The game ends when one player has every card or after the battle limit. Most cards wins; ties share the win.",
    },
  },
  settings: ["rounds", "turnSeconds"],
  presets: {
    quick: { rounds: 15, turnSeconds: 10 },
    standard: { rounds: 30, turnSeconds: 15 },
    long: { rounds: 60, turnSeconds: 20 },
  },
  actionSchema,

  setup(players, ctx) {
    const { hands } = deal(shuffledDeck(ctx.rng), players.length, "all");
    return {
      players,
      piles: Object.fromEntries(players.map((p, i) => [p, hands[i]!])),
      contenders: players.slice(),
      flips: Object.fromEntries(players.map((p) => [p, null])),
      pot: [],
      atWar: false,
      battle: 1,
      maxBattles: Math.max(5, ctx.config.rounds),
      over: false,
      deadline: deadlineFrom(ctx.now, ctx.config.turnSeconds),
      last: null,
      log: ["Battle 1 — everybody flip!"],
    };
  },

  validate(state, player) {
    if (state.over) return "The game is over.";
    if (!state.contenders.includes(player)) return "You're sitting this battle out.";
    if (state.flips[player]) return "You've already flipped.";
    return null;
  },

  apply(state, player, _action, ctx) {
    const pile = state.piles[player]!;
    // During a war, up to three cards go face down into the pot first (keeping one to flip).
    const faceDown = state.atWar ? pile.slice(0, Math.min(3, pile.length - 1)) : [];
    const rest = pile.slice(faceDown.length);
    let s: WarState = {
      ...state,
      piles: { ...state.piles, [player]: rest.slice(1) },
      flips: { ...state.flips, [player]: rest[0]! },
      pot: [...state.pot, ...faceDown],
    };
    if (s.contenders.some((p) => !s.flips[p])) return s;

    const flips = Object.fromEntries(s.contenders.map((p) => [p, s.flips[p]!])) as Record<PlayerId, CardId>;
    const pot = [...s.pot, ...Object.values(flips)];
    const best = Math.max(...Object.values(flips).map((c) => rankValue(c, true)));
    const top = s.contenders.filter((p) => rankValue(flips[p]!, true) === best);
    const reset = Object.fromEntries(s.players.map((p) => [p, null]));
    if (top.length > 1) {
      const able = top.filter((p) => s.piles[p]!.length > 0);
      if (able.length >= 2) {
        return {
          ...s,
          flips: reset,
          pot,
          contenders: able,
          atWar: true,
          deadline: deadlineFrom(ctx.now, ctx.config.turnSeconds),
          last: { flips, winner: null, war: true },
          log: pushLog(s.log, `War! ${able.map((p) => nameOf(ctx, p)).join(" vs ")}`),
        };
      }
      // Only one tied player can continue — they take the pot.
      top.splice(0, top.length, able[0] ?? top[0]!);
    }
    const winner = top[0]!;
    const piles = { ...s.piles, [winner]: [...s.piles[winner]!, ...ctx.rng.shuffle(pot)] };
    const battle = s.battle + 1;
    const alive = s.players.filter((p) => piles[p]!.length > 0);
    const over = alive.length <= 1 || battle > s.maxBattles;
    return {
      ...s,
      piles,
      flips: reset,
      pot: [],
      contenders: alive,
      atWar: false,
      battle,
      over,
      deadline: over ? null : deadlineFrom(ctx.now, ctx.config.turnSeconds),
      last: { flips, winner, war: s.atWar },
      log: pushLog(s.log, `${nameOf(ctx, winner)} wins ${pot.length} cards with ${cardLabel(flips[winner]!)}.`),
    };
  },

  pending: (state) => (state.over ? [] : state.contenders.filter((p) => !state.flips[p])),
  deadline: (state) => (state.over ? null : state.deadline),
  onTimeout: (state, ctx) => autoPlayPending(war, state, ctx),
  botAction: (state, player) => (!state.over && state.contenders.includes(player) && !state.flips[player] ? { type: "flip" } : null),

  isOver: (state) => state.over,
  results: (state, ctx) =>
    resultsFromScores(Object.fromEntries(state.players.map((p) => [p, state.piles[p]!.length])), ctx, { order: state.players }),
  roundSummaries: () => [],

  publicView(state): WarPublic {
    return {
      players: state.players,
      counts: Object.fromEntries(state.players.map((p) => [p, state.piles[p]!.length])),
      contenders: state.contenders,
      flipped: state.players.filter((p) => !!state.flips[p]),
      potCount: state.pot.length,
      atWar: state.atWar,
      battle: Math.min(state.battle, state.maxBattles),
      maxBattles: state.maxBattles,
      last: state.last,
      out: state.players.filter((p) => state.piles[p]!.length === 0 && !state.flips[p]),
      log: state.log,
      alive: withCards(state).length,
    };
  },
  privateView: (state, player) => (state.piles[player] ? { pileCount: state.piles[player]!.length } : null),
};

export interface WarPublic {
  players: PlayerId[];
  counts: Record<PlayerId, number>;
  contenders: PlayerId[];
  flipped: PlayerId[];
  potCount: number;
  atWar: boolean;
  battle: number;
  maxBattles: number;
  last: WarState["last"];
  out: PlayerId[];
  log: string[];
  alive: number;
}
