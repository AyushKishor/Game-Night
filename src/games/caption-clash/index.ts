import { z } from "zod";
import { REVEAL_SECONDS, deadlineFrom, nameOf, pushLog, resultsFromScores, zeroScores } from "@/lib/engine/helpers";
import type { GameContext, GameModule, PlayerId, RoundSummary } from "@/lib/engine/types";
import { CAPTION_MAX } from "@/lib/shared/text";
import { SIP_RULE, checkText, pickIndices } from "../shared/party";

export interface CaptionState {
  players: PlayerId[];
  scenarios: number[];
  round: number;
  phase: "write" | "vote" | "reveal" | "over";
  captions: Record<PlayerId, string>;
  /** Anonymous ballot: caption id -> author. Kept server-side until the reveal. */
  ballot: { id: string; author: PlayerId }[];
  votes: Record<PlayerId, string>;
  scores: Record<PlayerId, number>;
  last: { entries: { id: string; author: PlayerId; text: string; votes: number }[]; gained: Record<PlayerId, number> } | null;
  summaries: RoundSummary[];
  deadline: number | null;
  log: string[];
}

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("caption"), text: z.string().max(200) }),
  z.object({ type: z.literal("vote"), id: z.string().max(8) }),
  z.object({ type: z.literal("next") }),
]);
type Action = z.infer<typeof actionSchema>;

const canVote = (s: CaptionState, p: PlayerId) => s.ballot.some((b) => b.author !== p);

function toVote(state: CaptionState, ctx: GameContext): CaptionState {
  const authors = ctx.rng.shuffle(Object.keys(state.captions));
  const ballot = authors.map((author, i) => ({ id: `c${i + 1}`, author }));
  const s = {
    ...state,
    ballot,
    votes: {},
    phase: "vote" as const,
    deadline: deadlineFrom(ctx.now, Math.max(20, ctx.config.roundSeconds / 2)),
  };
  return ballot.length < 2 ? reveal(s, ctx) : s;
}

function reveal(state: CaptionState, ctx: GameContext): CaptionState {
  const tally: Record<string, number> = {};
  for (const id of Object.values(state.votes)) tally[id] = (tally[id] ?? 0) + 1;
  const gained = zeroScores(state.players);
  const entries = state.ballot.map((b) => ({ ...b, text: state.captions[b.author]!, votes: tally[b.id] ?? 0 }));
  const top = Math.max(0, ...entries.map((e) => e.votes));
  for (const e of entries) gained[e.author] = (gained[e.author] ?? 0) + e.votes + (top > 0 && e.votes === top ? 1 : 0);
  const scores = Object.fromEntries(state.players.map((p) => [p, state.scores[p]! + (gained[p] ?? 0)]));
  const winners = entries.filter((e) => top > 0 && e.votes === top);
  const summary: RoundSummary = {
    round: state.round,
    title: winners.length
      ? `Best caption: “${winners[0]!.text}” — ${winners.map((w) => nameOf(ctx, w.author)).join(" & ")}`
      : "No votes this round",
    lines: entries.map((e) => `${nameOf(ctx, e.author)}: ${e.votes} vote${e.votes === 1 ? "" : "s"}`),
    scores: gained,
  };
  return {
    ...state,
    phase: "reveal",
    scores,
    last: { entries: entries.sort((a, b) => b.votes - a.votes), gained },
    summaries: [...state.summaries, summary],
    deadline: deadlineFrom(ctx.now, REVEAL_SECONDS + 3),
    log: pushLog(state.log, summary.title),
  };
}

function next(state: CaptionState, ctx: GameContext): CaptionState {
  if (state.round >= state.scenarios.length) return { ...state, phase: "over", deadline: null };
  return {
    ...state,
    round: state.round + 1,
    phase: "write",
    captions: {},
    ballot: [],
    votes: {},
    deadline: deadlineFrom(ctx.now, ctx.config.roundSeconds),
  };
}

export const captionClash: GameModule<CaptionState, Action> = {
  meta: {
    id: "caption-clash",
    name: "Caption Clash",
    tagline: "Write the funniest caption. Vote anonymously.",
    category: "party",
    minPlayers: 3,
    maxPlayers: 12,
    duration: "10–20 min",
    icon: "MessageSquareQuote",
    accent: "amber",
    supportsBots: true,
    rules: {
      goal: "Write the captions that get the most votes.",
      steps: [
        "A silly scenario appears on the big screen.",
        "Everyone writes a caption for it on their phone.",
        "All captions are shown without names. Vote for your favourite (not your own).",
        "Authors are revealed with the votes.",
      ],
      scoring: "1 point per vote your caption receives, plus 1 bonus point for the top caption (shared on a tie).",
      ending: "Most points after the set number of rounds wins; ties share the win.",
    },
  },
  settings: ["rounds", "roundSeconds", "familyFriendly"],
  houseRules: [SIP_RULE],
  presets: {
    quick: { rounds: 3, roundSeconds: 60 },
    standard: { rounds: 5, roundSeconds: 75 },
    long: { rounds: 8, roundSeconds: 90 },
  },
  actionSchema,

  setup: (players, ctx) => ({
    players,
    scenarios: pickIndices(ctx.content.captionClash.scenarios.length, ctx.config.rounds, ctx.rng),
    round: 1,
    phase: "write",
    captions: {},
    ballot: [],
    votes: {},
    scores: zeroScores(players),
    last: null,
    summaries: [],
    deadline: deadlineFrom(ctx.now, ctx.config.roundSeconds),
    log: [],
  }),

  validate(state, player, action, ctx) {
    if (action.type === "next") {
      if (state.phase !== "reveal") return "Nothing to continue.";
      return player === ctx.hostId ? null : "Only the host can continue.";
    }
    if (action.type === "caption") {
      if (state.phase !== "write") return "Writing time is over.";
      if (state.captions[player]) return "You've already submitted.";
      const res = checkText(action.text, CAPTION_MAX, ctx.config);
      return "error" in res ? res.error : null;
    }
    if (state.phase !== "vote") return "Voting isn't open.";
    if (state.votes[player]) return "You've already voted.";
    const entry = state.ballot.find((b) => b.id === action.id);
    if (!entry) return "That caption doesn't exist.";
    if (entry.author === player) return "You can't vote for your own caption.";
    return null;
  },
  apply(state, player, action, ctx) {
    if (action.type === "next") return next(state, ctx);
    if (action.type === "caption") {
      const text = (checkText(action.text, CAPTION_MAX, ctx.config) as { text: string }).text;
      const s = { ...state, captions: { ...state.captions, [player]: text } };
      return state.players.every((p) => s.captions[p]) ? toVote(s, ctx) : s;
    }
    const s = { ...state, votes: { ...state.votes, [player]: action.id } };
    return s.players.filter((p) => canVote(s, p)).every((p) => s.votes[p]) ? reveal(s, ctx) : s;
  },
  pending(state) {
    if (state.phase === "write") return state.players.filter((p) => !state.captions[p]);
    if (state.phase === "vote") return state.players.filter((p) => canVote(state, p) && !state.votes[p]);
    return [];
  },
  deadline: (state) => (state.phase === "over" ? null : state.deadline),
  onTimeout(state, ctx) {
    if (state.phase === "write") return toVote(state, ctx);
    if (state.phase === "vote") return reveal(state, ctx);
    return next(state, ctx);
  },
  botAction(state, player, ctx) {
    if (state.phase === "write" && !state.captions[player])
      return { type: "caption", text: ctx.rng.pick(ctx.content.botCaptions.captions) };
    if (state.phase === "vote" && !state.votes[player]) {
      const options = state.ballot.filter((b) => b.author !== player);
      return options.length ? { type: "vote", id: ctx.rng.pick(options).id } : null;
    }
    return null;
  },
  isOver: (state) => state.phase === "over",
  results: (state, ctx) => resultsFromScores(state.scores, ctx, { order: state.players }),
  roundSummaries: (state) => state.summaries,

  publicView(state, ctx): CaptionPublic {
    return {
      players: state.players,
      round: state.round,
      total: state.scenarios.length,
      phase: state.phase,
      scenario: ctx.content.captionClash.scenarios[state.scenarios[state.round - 1]!]!,
      submitted: state.players.filter((p) => (state.phase === "write" ? state.captions[p] : state.votes[p])),
      ballot: state.phase === "vote" ? state.ballot.map((b) => ({ id: b.id, text: state.captions[b.author]! })) : null,
      last: state.phase === "reveal" || state.phase === "over" ? state.last : null,
      scores: state.scores,
      log: state.log,
    };
  },
  privateView: (state, player): CaptionPrivate => ({
    caption: state.captions[player] ?? null,
    myId: state.ballot.find((b) => b.author === player)?.id ?? null,
    vote: state.votes[player] ?? null,
  }),
};

export interface CaptionPublic {
  players: PlayerId[];
  round: number;
  total: number;
  phase: CaptionState["phase"];
  scenario: string;
  submitted: PlayerId[];
  ballot: { id: string; text: string }[] | null;
  last: CaptionState["last"];
  scores: Record<PlayerId, number>;
  log: string[];
}
export interface CaptionPrivate {
  caption: string | null;
  myId: string | null;
  vote: string | null;
}
