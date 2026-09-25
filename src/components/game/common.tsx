"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Bot, Crown, Hourglass, WifiOff } from "lucide-react";
import type { PlayerId, RoundSummary } from "@/lib/engine/types";
import type { PublicPlayer } from "@/lib/shared/protocol";
import { serverNow } from "@/lib/client/room-store";
import { play } from "@/lib/client/sound";
import { cn } from "@/lib/utils";

export function Countdown({
  deadline,
  total,
  forMe = false,
  label = "Time left",
  className,
}: {
  deadline: number | null;
  total?: number;
  forMe?: boolean;
  label?: string;
  className?: string;
}) {
  const [now, setNow] = useState(() => serverNow());
  const warned = useRef<number | null>(null);
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(t);
  }, [deadline]);
  const warnNow = !!deadline && forMe && deadline - now <= 5000 && deadline - now > 0;
  useEffect(() => {
    if (warnNow && warned.current !== deadline) {
      warned.current = deadline;
      play("warning");
    }
  }, [warnNow, deadline]);
  if (!deadline) return null;
  const remaining = Math.max(0, deadline - now);
  const secs = Math.ceil(remaining / 1000);
  const fraction = total ? Math.min(1, remaining / (total * 1000)) : 1;
  const urgent = secs <= 5;
  return (
    <div
      className={cn("flex min-w-28 items-center gap-2", className)}
      role="timer"
      aria-live="off"
      aria-label={`${label}: ${secs} seconds`}
    >
      <Hourglass className={cn("size-4 shrink-0", urgent ? "text-rose" : "text-muted")} aria-hidden />
      <div className="bg-surface-3 h-2 flex-1 overflow-hidden rounded-full">
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", urgent ? "bg-rose" : "bg-sky")}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      <span className={cn("w-9 text-right font-mono text-sm font-bold tabular-nums", urgent && "text-rose")}>{secs}s</span>
    </div>
  );
}

export interface SeatInfo {
  id: PlayerId;
  detail?: React.ReactNode;
  score?: number | string;
  active?: boolean;
  done?: boolean;
  out?: boolean;
}

export function Seats({
  seats,
  players,
  names,
  meId,
  autopilot = [],
  className,
  compact,
}: {
  seats: SeatInfo[];
  players: PublicPlayer[];
  names: Record<PlayerId, string>;
  meId?: PlayerId;
  autopilot?: PlayerId[];
  className?: string;
  compact?: boolean;
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  return (
    <ul
      className={cn(
        "grid gap-2",
        compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-4",
        className,
      )}
      aria-label="Players"
    >
      {seats.map((s) => {
        const p = byId.get(s.id);
        const away = p ? !p.connected : true;
        const auto = autopilot.includes(s.id);
        return (
          <motion.li
            layout
            key={s.id}
            className={cn(
              "bg-surface-2 relative flex items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors",
              s.active ? "border-amber shadow-[0_0_0_2px_rgba(255,193,69,0.35)]" : "border-border",
              s.out && "opacity-60",
            )}
          >
            <span className="text-2xl" aria-hidden>
              {p?.avatar ?? "👤"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-semibold">
                  {names[s.id] ?? "Player"}
                  {s.id === meId && <span className="text-muted"> (you)</span>}
                </span>
                {p?.isHost && <Crown className="text-amber size-3.5 shrink-0" aria-label="Host" />}
              </div>
              <div className="text-muted flex flex-wrap items-center gap-x-2 text-xs">
                {s.active && <span className="text-amber font-bold">▶ Turn</span>}
                {s.done && <span className="text-mint font-bold">✓ Done</span>}
                {s.detail}
                {auto && (
                  <span className="inline-flex items-center gap-0.5">
                    <Bot className="size-3" aria-hidden /> {p?.isBot ? "Bot" : "Auto-playing"}
                  </span>
                )}
                {away && !p?.isBot && (
                  <span className="text-rose inline-flex items-center gap-0.5">
                    <WifiOff className="size-3" aria-hidden /> Away
                  </span>
                )}
              </div>
            </div>
            {s.score !== undefined && (
              <span
                className="bg-bg-2 rounded-lg px-2 py-1 font-mono text-sm font-bold tabular-nums"
                aria-label={`Score ${s.score}`}
              >
                {s.score}
              </span>
            )}
          </motion.li>
        );
      })}
    </ul>
  );
}

export function StatusBanner({
  tone = "neutral",
  children,
}: {
  tone?: "turn" | "wait" | "neutral" | "done";
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "font-display rounded-xl px-4 py-3 text-center text-lg font-bold",
        tone === "turn" && "bg-amber text-[#2a1c00]",
        tone === "wait" && "bg-surface-2 text-muted",
        tone === "neutral" && "bg-surface-2 text-text",
        tone === "done" && "bg-mint/15 text-mint",
      )}
    >
      {children}
    </div>
  );
}

export function EventLog({ entries, className }: { entries: string[]; className?: string }) {
  const recent = entries.slice(-6).reverse();
  if (!recent.length) return null;
  return (
    <div className={cn("border-border bg-bg-2/70 rounded-xl border p-3", className)}>
      <h3 className="text-muted mb-1.5 text-xs font-bold tracking-wider uppercase">What happened</h3>
      <ol className="space-y-1 text-sm" aria-live="polite">
        {recent.map((e, i) => (
          <li key={`${recent.length - i}-${e}`} className={cn(i === 0 ? "text-text" : "text-muted")}>
            {e}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function RoundSummaries({ summaries, names }: { summaries: RoundSummary[]; names: Record<PlayerId, string> }) {
  const last = summaries[summaries.length - 1];
  if (!last) return null;
  return (
    <div className="border-mint/40 bg-mint/10 rounded-xl border p-4">
      <h3 className="font-display text-lg font-bold">
        Round {last.round}: {last.title}
      </h3>
      {last.lines.length > 0 && (
        <ul className="text-muted mt-2 space-y-0.5 text-sm">
          {last.lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
      <p className="sr-only">
        Round points:{" "}
        {Object.entries(last.scores)
          .map(([id, s]) => `${names[id] ?? "Player"} ${s}`)
          .join(", ")}
      </p>
    </div>
  );
}

export function Big({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("font-display text-2xl font-extrabold tracking-tight sm:text-3xl", className)}>{children}</p>;
}
