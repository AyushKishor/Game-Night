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
  if (!deadline) return null;
  const remaining = Math.max(0, deadline - now);
  const secs = Math.ceil(remaining / 1000);
  const fraction = total ? Math.min(1, remaining / (total * 1000)) : 1;
  if (forMe && secs <= 5 && secs > 0 && warned.current !== deadline) {
    warned.current = deadline;
    play("warning");
  }
  const urgent = secs <= 5;
  return (
    <div className={cn("flex min-w-28 items-center gap-2", className)} role="timer" aria-live="off" aria-label={`${label}: ${secs} seconds`}>
      <Hourglass className={cn("size-4 shrink-0", urgent ? "text-rose" : "text-muted")} aria-hidden />
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
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
    <ul className={cn("grid gap-2", compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-4", className)} aria-label="Players">
      {seats.map((s) => {
        const p = byId.get(s.id);
        const away = p ? !p.connected : true;
        const auto = autopilot.includes(s.id);
        return (
          <motion.li
            layout
            key={s.id}
            className={cn(
              "relative flex items-center gap-2.5 rounded-xl border bg-surface-2 px-3 py-2 transition-colors",
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
                {p?.isHost && <Crown className="size-3.5 shrink-0 text-amber" aria-label="Host" />}
              </div>
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                {s.active && <span className="font-bold text-amber">▶ Turn</span>}
                {s.done && <span className="font-bold text-mint">✓ Done</span>}
                {s.detail}
                {auto && (
                  <span className="inline-flex items-center gap-0.5">
                    <Bot className="size-3" aria-hidden /> {p?.isBot ? "Bot" : "Auto-playing"}
                  </span>
                )}
                {away && !p?.isBot && (
                  <span className="inline-flex items-center gap-0.5 text-rose">
                    <WifiOff className="size-3" aria-hidden /> Away
                  </span>
                )}
              </div>
            </div>
            {s.score !== undefined && (
              <span className="rounded-lg bg-bg-2 px-2 py-1 font-mono text-sm font-bold tabular-nums" aria-label={`Score ${s.score}`}>
                {s.score}
              </span>
            )}
          </motion.li>
        );
      })}
    </ul>
  );
}

export function StatusBanner({ tone = "neutral", children }: { tone?: "turn" | "wait" | "neutral" | "done"; children: React.ReactNode }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-xl px-4 py-3 text-center font-display text-lg font-bold",
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
    <div className={cn("rounded-xl border border-border bg-bg-2/70 p-3", className)}>
      <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted">What happened</h3>
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
    <div className="rounded-xl border border-mint/40 bg-mint/10 p-4">
      <h3 className="font-display text-lg font-bold">
        Round {last.round}: {last.title}
      </h3>
      {last.lines.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-sm text-muted">
          {last.lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
      <p className="sr-only">
        Round points: {Object.entries(last.scores).map(([id, s]) => `${names[id] ?? "Player"} ${s}`).join(", ")}
      </p>
    </div>
  );
}

export function Big({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("font-display text-2xl font-extrabold tracking-tight sm:text-3xl", className)}>{children}</p>;
}
