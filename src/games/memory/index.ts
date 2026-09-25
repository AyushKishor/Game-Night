import { z } from "zod";
import { type CardId, RANKS, cardLabel, isRed, rankOf } from "@/lib/engine/cards";
import { deadlineFrom, nameOf, nextPlayer, pushLog, resultsFromScores, zeroScores } from "@/lib/engine/helpers";
import type { GameModule, PlayerId } from "@/lib/engine/types";
import { autoPlayPending } from "../shared/auto";

export interface MemoryState {
  players: PlayerId[];
  cards: CardId[];
  matchedBy: Record<number, PlayerId>;
  faceUp: number[];
  /** A mismatched pair stays visible until the next flip. */
  showing: number[];
  seen: number[];
  turn: PlayerId;
  scores: Record<PlayerId, number>;
  deadline: number | null;
  log: string[];
}

const actionSchema = z.object({ type: z.literal("flip"), index: z.number().int().min(0).max(51) });
type Action = z.infer<typeof actionSchema>;

/** Cards match when they share rank and colour (e.g. 7♥ and 7♦). */
export const isPair = (a: CardId, b: CardId) => rankOf(a) === rankOf(b) && isRed(a) === isRed(b);

const PAIRS = { easy: 8, normal: 12, hard: 18 } as const;

export const memory: GameModule<MemoryState, Action> = {
  meta: {
    id: "memory",
    name: "Memory Match",
    tagline: "Flip two, remember everything.",
    category: "card",
    minPlayers: 1,
    maxPlayers: 8,
    duration: "5–15 min",
    icon: "Grid3x3",
    accent: "mint",
    supportsBots: true,
    rules: {
      goal: "Find the most matching pairs.",
      steps: [
        "Cards are laid out face down in a grid.",
        "On your turn, flip two cards. A pair is the same rank and colour — like 7♥ and 7♦.",
        "Find a pair and you keep it and go again.",
        "No match? Everyone gets a look, then the cards flip back and the next player goes.",
        "Difficulty sets the grid size: 16, 24 or 36 cards.",
      ],
      scoring: "One point per pair.",
      ending: "The game ends when every pair is found. Most pairs wins; ties share the win.",
    },
  },
  settings: ["difficulty", "turnSeconds"],
  presets: {
    quick: { difficulty: "easy", turnSeconds: 15 },
    standard: { difficulty: "normal", turnSeconds: 20 },
    long: { difficulty: "hard", turnSeconds: 30 },
  },
  actionSchema,

  setup(players, ctx) {
    const pairs: CardId[] = [];
    const all = RANKS.flatMap((r) => [
      [`${r}H`, `${r}D`],
      [`${r}S`, `${r}C`],
    ]);
    for (const pair of ctx.rng.shuffle(all).slice(0, PAIRS[ctx.config.difficulty])) pairs.push(...pair);
    return {
      players,
      cards: ctx.rng.shuffle(pairs),
      matchedBy: {},
      faceUp: [],
      showing: [],
      seen: [],
      turn: players[0]!,
      scores: zeroScores(players),
      deadline: deadlineFrom(ctx.now, ctx.config.turnSeconds),
      log: ["Find the pairs!"],
    };
  },

  validate(state, player, action) {
    if (Object.keys(state.matchedBy).length === state.cards.length) return "The game is over.";
    if (state.turn !== player) return "It's not your turn.";
    if (action.index >= state.cards.length) return "That's not a card.";
    if (state.matchedBy[action.index] !== undefined) return "That pair has already been found.";
    if (state.faceUp.includes(action.index)) return "That card is already face up.";
    return null;
  },

  apply(state, player, action, ctx) {
    const faceUp = [...state.faceUp, action.index];
    const seen = state.seen.includes(action.index) ? state.seen : [...state.seen, action.index];
    const base = { ...state, faceUp, seen, showing: [] as number[] };
    if (faceUp.length < 2) return base;
    const [a, b] = faceUp as [number, number];
    if (isPair(state.cards[a]!, state.cards[b]!)) {
      const matchedBy = { ...state.matchedBy, [a]: player, [b]: player };
      const scores = { ...state.scores, [player]: state.scores[player]! + 1 };
      const done = Object.keys(matchedBy).length === state.cards.length;
      return {
        ...base,
        faceUp: [],
        matchedBy,
        scores,
        deadline: done ? null : deadlineFrom(ctx.now, ctx.config.turnSeconds),
        log: pushLog(state.log, `${nameOf(ctx, player)} found a pair of ${cardLabel(state.cards[a]!)} & ${cardLabel(state.cards[b]!)}!`),
      };
    }
    return {
      ...base,
      faceUp: [],
      showing: [a, b],
      turn: nextPlayer(state.players, player),
      deadline: deadlineFrom(ctx.now, ctx.config.turnSeconds),
      log: pushLog(state.log, `${nameOf(ctx, player)} missed.`),
    };
  },

  pending: (state) => (Object.keys(state.matchedBy).length === state.cards.length ? [] : [state.turn]),
  deadline: (state) => state.deadline,
  onTimeout: (state, ctx) => autoPlayPending(memory, state, ctx),

  botAction(state, player, ctx) {
    if (state.turn !== player) return null;
    const open = state.cards.map((_, i) => i).filter((i) => state.matchedBy[i] === undefined && !state.faceUp.includes(i));
    if (!open.length) return null;
    const recall = { easy: 0.3, normal: 0.6, hard: 0.9 }[ctx.config.difficulty];
    const known = open.filter((i) => state.seen.includes(i));
    if (state.faceUp.length === 1) {
      const first = state.faceUp[0]!;
      const match = known.find((i) => isPair(state.cards[i]!, state.cards[first]!));
      if (match !== undefined && ctx.rng.next() < recall) return { type: "flip", index: match };
      const unseen = open.filter((i) => !state.seen.includes(i));
      return { type: "flip", index: ctx.rng.pick(unseen.length ? unseen : open) };
    }
    for (const i of known) {
      if (known.some((j) => j !== i && isPair(state.cards[i]!, state.cards[j]!)) && ctx.rng.next() < recall) {
        return { type: "flip", index: i };
      }
    }
    const unseen = open.filter((i) => !state.seen.includes(i));
    return { type: "flip", index: ctx.rng.pick(unseen.length ? unseen : open) };
  },

  isOver: (state) => Object.keys(state.matchedBy).length === state.cards.length,
  results: (state, ctx) => resultsFromScores(state.scores, ctx, { order: state.players }),
  roundSummaries: () => [],

  publicView(state): MemoryPublic {
    return {
      players: state.players,
      grid: state.cards.map((c, i) => {
        const owner = state.matchedBy[i];
        if (owner !== undefined) return { state: "matched" as const, card: c, owner };
        if (state.faceUp.includes(i) || state.showing.includes(i)) return { state: "up" as const, card: c };
        return { state: "down" as const };
      }),
      turn: state.turn,
      flippedThisTurn: state.faceUp.length,
      scores: state.scores,
      log: state.log,
    };
  },
  privateView: () => null,
};

export interface MemoryPublic {
  players: PlayerId[];
  grid: ({ state: "matched"; card: CardId; owner: PlayerId } | { state: "up"; card: CardId } | { state: "down" })[];
  turn: PlayerId;
  flippedThisTurn: number;
  scores: Record<PlayerId, number>;
  log: string[];
}
