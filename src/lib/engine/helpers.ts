import type { GameConfig, GameResults, PlayerId, PresetId, Standing, ViewContext } from "./types";

export const DEFAULT_CONFIG: GameConfig = {
  rounds: 3,
  targetScore: 100,
  turnSeconds: 30,
  roundSeconds: 45,
  difficulty: "normal",
  teamMode: false,
  familyFriendly: true,
  allowJoinInProgress: false,
  houseRules: {},
};

export const PRESET_LABELS: Record<PresetId, string> = {
  quick: "Quick Game",
  standard: "Standard Game",
  long: "Long Game",
};

/** Index helpers for circular turn order. */
export function nextIndex(current: number, count: number, direction: 1 | -1 = 1): number {
  return (((current + direction) % count) + count) % count;
}

export function nextPlayer(order: PlayerId[], current: PlayerId, direction: 1 | -1 = 1): PlayerId {
  const idx = order.indexOf(current);
  return order[nextIndex(idx, order.length, direction)]!;
}

/**
 * Turn a score map into standings. Tied scores share a place
 * ("1, 1, 3" ranking). Ties can be broken by an optional secondary key.
 */
export function standingsFromScores(
  scores: Record<PlayerId, number>,
  opts: { lowerIsBetter?: boolean; tieBreak?: Record<PlayerId, number>; order?: PlayerId[] } = {},
): Standing[] {
  const { lowerIsBetter = false, tieBreak } = opts;
  const ids = opts.order ?? Object.keys(scores);
  const key = (id: PlayerId) => [scores[id] ?? 0, tieBreak?.[id] ?? 0] as const;
  const sorted = ids.slice().sort((a, b) => {
    const [sa, ta] = key(a);
    const [sb, tb] = key(b);
    if (sa !== sb) return lowerIsBetter ? sa - sb : sb - sa;
    return tb - ta;
  });
  const standings: Standing[] = [];
  sorted.forEach((id, i) => {
    const prev = standings[i - 1];
    const [s, t] = key(id);
    const tiedWithPrev = prev && prev.score === s && (tieBreak?.[prev.playerId] ?? 0) === t;
    standings.push({ playerId: id, score: s, place: tiedWithPrev ? prev.place : i + 1 });
  });
  return standings;
}

export function describeWinners(standings: Standing[], ctx: Pick<ViewContext, "names">): string {
  const winners = standings.filter((s) => s.place === 1).map((s) => ctx.names[s.playerId] ?? "Someone");
  if (winners.length === 0) return "No winner this time.";
  if (winners.length === 1) return `${winners[0]} wins!`;
  return `It's a tie between ${winners.slice(0, -1).join(", ")} and ${winners[winners.length - 1]}!`;
}

export function resultsFromScores(
  scores: Record<PlayerId, number>,
  ctx: Pick<ViewContext, "names">,
  opts: { lowerIsBetter?: boolean; tieBreak?: Record<PlayerId, number>; order?: PlayerId[] } = {},
): GameResults {
  const standings = standingsFromScores(scores, opts);
  return { standings, summary: describeWinners(standings, ctx) };
}

export function zeroScores(players: PlayerId[]): Record<PlayerId, number> {
  return Object.fromEntries(players.map((p) => [p, 0]));
}

export function addScores(
  a: Record<PlayerId, number>,
  b: Record<PlayerId, number>,
): Record<PlayerId, number> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
  return out;
}

export function deadlineFrom(now: number, seconds: number): number | null {
  return seconds > 0 ? now + seconds * 1000 : null;
}

/** Seconds the results/reveal screen stays up before auto-advancing. */
export const REVEAL_SECONDS = 10;

export function nameOf(ctx: Pick<ViewContext, "names">, id: PlayerId): string {
  return ctx.names[id] ?? "Player";
}

/** Keep the public event log short. */
export function pushLog(log: string[], ...entries: string[]): string[] {
  return [...log, ...entries].slice(-30);
}
