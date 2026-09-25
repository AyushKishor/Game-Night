"use client";
import { Check, Beer } from "lucide-react";
import { motion } from "framer-motion";
import type { CardId } from "@/lib/engine/cards";
import type { PlayerId, RoundSummary } from "@/lib/engine/types";
import type { GameSnapshot, MeSnapshot, PublicPlayer, RoomSnapshot } from "@/lib/shared/protocol";
import { sippersOf } from "@/games/shared/party";
import { cn } from "@/lib/utils";
import { Countdown, StatusBanner } from "./common";
import { NextRoundButton } from "./next-round";
import { PlayingCard, type CardSize } from "./playing-card";

/** Round counter + big prompt used by party games. */
export function PromptHeader({
  label,
  prompt,
  sub,
  game,
  forMe,
  big,
}: {
  label: string;
  prompt: React.ReactNode;
  sub?: React.ReactNode;
  game: GameSnapshot;
  forMe?: boolean;
  big?: boolean;
}) {
  return (
    <div className="border-border bg-surface-2/80 rounded-2xl border p-4 text-center sm:p-5">
      <p className="text-muted text-sm font-bold tracking-wider uppercase">{label}</p>
      <div
        className={cn(
          "font-display mt-2 leading-tight font-extrabold",
          big ? "text-3xl sm:text-4xl xl:text-5xl" : "text-2xl sm:text-3xl",
        )}
      >
        {prompt}
      </div>
      {sub && <div className="text-muted mt-2">{sub}</div>}
      {game.deadline && !game.over && (
        <Countdown
          deadline={game.deadline}
          forMe={forMe}
          total={game.config.roundSeconds || game.config.turnSeconds}
          className="mx-auto mt-4 max-w-sm"
        />
      )}
    </div>
  );
}

/** Who has locked in (without revealing what they chose). */
export function LockedIn({
  players,
  done,
  room,
  names,
  label = "Locked in",
}: {
  players: PlayerId[];
  done: PlayerId[];
  room: RoomSnapshot;
  names: Record<string, string>;
  label?: string;
}) {
  const byId = new Map<string, PublicPlayer>(room.players.map((p) => [p.id, p]));
  return (
    <div>
      <p className="text-muted mb-2 text-sm font-semibold">
        {label}: {done.length}/{players.length}
      </p>
      <ul className="flex flex-wrap gap-2">
        {players.map((id) => {
          const ok = done.includes(id);
          return (
            <li
              key={id}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm",
                ok ? "border-mint/60 bg-mint/10 text-text" : "border-border text-muted",
              )}
            >
              <span aria-hidden>{byId.get(id)?.avatar ?? "👤"}</span>
              {names[id] ?? "Player"}
              {ok ? <Check className="text-mint size-4" aria-label="done" /> : <span className="sr-only">waiting</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Big tappable options (answers, votes, sides). */
export function ChoiceGrid({
  options,
  selected,
  correct,
  disabled,
  onPick,
  columns = 2,
  counts,
}: {
  options: { key: string | number; label: React.ReactNode; sub?: React.ReactNode }[];
  selected?: string | number | null;
  correct?: string | number | null;
  disabled?: boolean;
  onPick?: (key: string | number) => void;
  columns?: 1 | 2;
  counts?: Record<string | number, number>;
}) {
  const colors = [
    "bg-coral/15 border-coral/50",
    "bg-sky/15 border-sky/50",
    "bg-mint/15 border-mint/50",
    "bg-amber/15 border-amber/50",
    "bg-violet/15 border-violet/50",
    "bg-rose/15 border-rose/50",
  ];
  const shapes = ["▲", "◆", "●", "■", "★", "✚"];
  return (
    <div className={cn("grid gap-3", columns === 2 ? "sm:grid-cols-2" : "grid-cols-1")} role="group">
      {options.map((o, i) => {
        const isSel = selected === o.key;
        const isCorrect = correct !== undefined && correct !== null && correct === o.key;
        const isWrong = correct !== undefined && correct !== null && isSel && !isCorrect;
        return (
          <motion.button
            key={o.key}
            type="button"
            whileTap={{ scale: 0.97 }}
            disabled={disabled || !onPick}
            onClick={() => onPick?.(o.key)}
            aria-pressed={isSel}
            className={cn(
              "flex min-h-16 items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-lg font-semibold transition-colors disabled:cursor-default",
              colors[i % colors.length],
              isSel && "ring-text/70 ring-4",
              isCorrect && "border-mint bg-mint/30",
              isWrong && "opacity-60",
              correct !== undefined && correct !== null && !isCorrect && !isSel && "opacity-50",
            )}
          >
            <span className="text-xl" aria-hidden>
              {shapes[i % shapes.length]}
            </span>
            <span className="flex-1">
              {o.label}
              {o.sub && <span className="text-muted block text-sm font-normal">{o.sub}</span>}
            </span>
            {counts && counts[o.key] !== undefined && (
              <span className="bg-bg-2 rounded-lg px-2 py-0.5 font-mono text-base">{counts[o.key]}</span>
            )}
            {isCorrect && <Check className="text-mint size-6" aria-label="Correct answer" />}
          </motion.button>
        );
      })}
    </div>
  );
}

/** Last round's summary, sip call-outs and the host's continue button. */
export function RoundReveal({
  summary,
  room,
  me,
  game,
  names,
  onNext,
  children,
  scores,
  badges,
  lowerIsBetter,
}: {
  summary: RoundSummary | undefined;
  room: RoomSnapshot;
  me: MeSnapshot;
  game: GameSnapshot;
  names: Record<string, string>;
  onNext: () => void;
  children?: React.ReactNode;
  /** Running totals: shows a Kahoot-style leaderboard with rank changes. */
  scores?: Record<string, number>;
  badges?: Record<string, string>;
  lowerIsBetter?: boolean;
}) {
  const sips = summary && game.config.houseRules.sips ? sippersOf(summary) : [];
  return (
    <div className="border-mint/40 bg-mint/10 space-y-3 rounded-2xl border p-4">
      {sips.length > 0 && (
        <motion.p
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-amber flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-center text-xl font-extrabold text-[#2a1c00]"
          role="status"
        >
          <Beer className="size-6" aria-hidden /> DRINK: {sips.map((p) => names[p] ?? "Player").join(", ")}
        </motion.p>
      )}
      {summary && <h3 className="font-display text-xl font-bold">{summary.title}</h3>}
      {children}
      {summary && summary.lines.length > 0 && !children && (
        <ul className="text-muted space-y-0.5">
          {summary.lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
      {scores && summary && (
        <RoundStandings
          scores={scores}
          gained={summary.scores}
          names={names}
          room={room}
          meId={me.playerId}
          badges={badges}
          lowerIsBetter={lowerIsBetter}
        />
      )}
      {!game.over && <NextRoundButton room={room} me={me} deadline={game.deadline} onNext={onNext} label="Next" />}
    </div>
  );
}

/** Your hand with optional single or multi selection. */
export function HandPicker({
  hand,
  playable,
  selected,
  onToggle,
  disabled,
  size = "md",
  label = "Your hand",
}: {
  hand: CardId[];
  playable?: CardId[];
  selected: CardId[];
  onToggle?: (c: CardId) => void;
  disabled?: boolean;
  size?: CardSize;
  label?: string;
}) {
  const set = playable ? new Set(playable) : null;
  return (
    <section aria-label={label} className="border-border bg-surface-2/70 rounded-2xl border p-3">
      <p className="text-muted mb-1 text-sm font-semibold">
        {label} · {hand.length} card{hand.length === 1 ? "" : "s"}
      </p>
      <div className="flex flex-wrap justify-center gap-2 pt-4 pb-2">
        {hand.map((c) => {
          const can = !disabled && (!set || set.has(c));
          return (
            <PlayingCard
              key={c}
              card={c}
              size={size}
              playable={!!set && can}
              disabled={!onToggle || !can}
              hint={set && can ? "playable" : undefined}
              selected={selected.includes(c)}
              onClick={onToggle ? () => onToggle(c) : undefined}
            />
          );
        })}
        {hand.length === 0 && <p className="text-muted py-6">No cards.</p>}
      </div>
    </section>
  );
}

export function turnBanner(myTurn: boolean, whoseTurn: string, extra?: string) {
  return (
    <StatusBanner tone={myTurn ? "turn" : "wait"}>
      {myTurn ? `Your turn${extra ? ` — ${extra}` : ""}` : `${whoseTurn}'s turn`}
    </StatusBanner>
  );
}

export function Scoreline({
  scores,
  names,
  lowerIsBetter,
}: {
  scores: Record<string, number>;
  names: Record<string, string>;
  lowerIsBetter?: boolean;
}) {
  const sorted = Object.entries(scores).sort((a, b) => (lowerIsBetter ? a[1] - b[1] : b[1] - a[1]));
  return (
    <ol className="flex flex-wrap gap-2 text-sm" aria-label="Scores">
      {sorted.map(([id, s]) => (
        <li key={id} className="bg-surface-2 rounded-full px-3 py-1">
          {names[id] ?? "Player"} <strong className="font-mono">{s}</strong>
        </li>
      ))}
    </ol>
  );
}

/** Kahoot-style leaderboard after a round: animated bars, points gained and rank movement. */
export function RoundStandings({
  scores,
  gained,
  names,
  room,
  meId,
  badges,
  lowerIsBetter,
  limit = 8,
}: {
  scores: Record<string, number>;
  gained: Record<string, number>;
  names: Record<string, string>;
  room: RoomSnapshot;
  meId?: string;
  badges?: Record<string, string>;
  lowerIsBetter?: boolean;
  limit?: number;
}) {
  const ids = Object.keys(scores);
  const order = (m: Record<string, number>) =>
    ids.slice().sort((a, b) => (lowerIsBetter ? m[a]! - m[b]! : m[b]! - m[a]!) || (names[a] ?? "").localeCompare(names[b] ?? ""));
  const before = Object.fromEntries(ids.map((id) => [id, (scores[id] ?? 0) - (gained[id] ?? 0)]));
  const nowOrder = order(scores);
  const better = (m: Record<string, number>, id: string) =>
    ids.filter((o) => (lowerIsBetter ? m[o]! < m[id]! : m[o]! > m[id]!)).length;
  // Tied players share a rank.
  const rankNow = Object.fromEntries(ids.map((id) => [id, better(scores, id)]));
  const prevRank = Object.fromEntries(ids.map((id) => [id, better(before, id)]));
  const max = Math.max(1, ...ids.map((id) => Math.abs(scores[id] ?? 0)));
  const avatar = (id: string) => room.players.find((p) => p.id === id)?.avatar ?? "👤";
  return (
    <div className="bg-bg-2/80 rounded-2xl p-3" aria-label="Leaderboard after this round">
      <p className="text-muted mb-2 text-sm font-bold tracking-wider uppercase">Leaderboard</p>
      <ol className="space-y-1.5">
        {nowOrder.slice(0, limit).map((id, i) => {
          const rank = rankNow[id]!;
          const move = prevRank[id]! - rank;
          const g = gained[id] ?? 0;
          return (
            <motion.li
              layout
              key={id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, type: "spring", stiffness: 300, damping: 26 }}
              className={cn(
                "relative flex items-center gap-2 overflow-hidden rounded-xl px-3 py-2",
                rank === 0 ? "bg-amber/20" : "bg-surface-2",
                id === meId && "ring-sky ring-2",
              )}
            >
              <motion.span
                aria-hidden
                className={cn("absolute inset-y-0 left-0", rank === 0 ? "bg-amber/25" : "bg-sky/15")}
                initial={{ width: 0 }}
                animate={{ width: `${(Math.abs(scores[id] ?? 0) / max) * 100}%` }}
                transition={{ duration: 0.8, delay: 0.2 + i * 0.06 }}
              />
              <span className="relative w-6 text-center font-mono font-extrabold">
                {rank === 0 && (scores[id] ?? 0) !== 0 ? "👑" : rank + 1}
              </span>
              <span className="relative text-xl" aria-hidden>
                {avatar(id)}
              </span>
              <span className="relative flex-1 truncate font-semibold">
                {names[id] ?? "Player"}
                {badges?.[id] && <span className="ml-1.5 text-sm">{badges[id]}</span>}
              </span>
              {move !== 0 && (
                <span
                  className={cn("relative text-sm font-bold", move > 0 ? "text-mint" : "text-rose")}
                  aria-label={move > 0 ? `up ${move}` : `down ${-move}`}
                >
                  {move > 0 ? `▲${move}` : `▼${-move}`}
                </span>
              )}
              {g !== 0 && (
                <span className={cn("relative text-sm font-bold", g > 0 ? "text-mint" : "text-rose")}>
                  {g > 0 ? "+" : ""}
                  {g}
                </span>
              )}
              <span className="relative w-12 text-right font-mono text-lg font-extrabold tabular-nums">{scores[id]}</span>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
