"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeftRight, Megaphone, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type ColourClashPrivate,
  type ColourClashPublic,
  UNO_COLORS,
  UNO_COLOR_NAMES,
  type UnoColor,
  unoCard,
  unoLabel,
} from "@/games/colour-clash";
import { cn } from "@/lib/utils";
import { Countdown, EventLog, RoundSummaries, Seats, StatusBanner } from "./common";
import { NextRoundButton } from "./next-round";
import type { GameViewProps } from "./types";

export const UNO_HEX: Record<UnoColor, string> = { R: "#e5383b", Y: "#f6c700", G: "#2bb24c", B: "#1f6fe5" };

const SIZE = {
  sm: "w-12 h-[4.5rem] text-lg rounded-lg",
  md: "w-[4.2rem] h-[6.2rem] text-2xl rounded-xl",
  lg: "w-24 h-36 text-4xl rounded-2xl",
};

export function UnoCardView({
  id,
  size = "md",
  onClick,
  playable,
  selected,
  dim,
}: {
  id: string;
  size?: keyof typeof SIZE;
  onClick?: () => void;
  playable?: boolean;
  selected?: boolean;
  dim?: boolean;
}) {
  const c = unoCard(id);
  const symbol =
    c.kind === "num"
      ? String(c.n)
      : c.kind === "skip"
        ? "⊘"
        : c.kind === "reverse"
          ? "⇄"
          : c.kind === "draw2"
            ? "+2"
            : c.kind === "wild4"
              ? "+4"
              : "W";
  const bg = c.color ? UNO_HEX[c.color] : "conic-gradient(#e5383b 0 25%, #f6c700 0 50%, #2bb24c 0 75%, #1f6fe5 0)";
  const cls = cn(
    "shadow-card relative grid shrink-0 place-items-center border-[3px] border-white font-display font-black text-white select-none",
    SIZE[size],
    playable && "ring-amber ring-2",
    selected && "ring-amber -translate-y-2 ring-4",
    dim && "opacity-40",
    onClick && "cursor-pointer transition-transform hover:-translate-y-1",
  );
  const inner = (
    <>
      <span className="absolute inset-[14%] rotate-[-18deg] rounded-[50%] bg-white/90" aria-hidden />
      <span className="relative [text-shadow:0_2px_0_rgb(0_0_0/0.35)]" style={{ color: c.color ? UNO_HEX[c.color] : "#1d1d1d" }}>
        {symbol}
      </span>
    </>
  );
  const label = `${unoLabel(id)}${playable ? ", playable" : ""}`;
  return onClick ? (
    <button type="button" className={cls} style={{ background: bg }} onClick={onClick} aria-label={label} aria-pressed={selected}>
      {inner}
    </button>
  ) : (
    <div className={cls} style={{ background: bg }} role="img" aria-label={label}>
      {inner}
    </div>
  );
}

export function ColourClashView({
  pub,
  priv,
  mode,
  room,
  game,
  me,
  names,
  send,
}: GameViewProps<ColourClashPublic, ColourClashPrivate>) {
  const [wild, setWild] = useState<string | null>(null);
  const [uno, setUno] = useState(false);
  const handMode = mode === "hand" && !!priv;
  const myTurn = pub.phase === "play" && pub.turn === me.playerId;
  const hand = priv?.hand ?? [];
  const playable = new Set(priv?.playable ?? []);

  const play = async (card: string, color?: UnoColor) => {
    const ok = await send({ type: "play", card, ...(color ? { color } : {}), uno });
    if (ok) {
      setWild(null);
      setUno(false);
    }
  };
  const tap = (card: string) => {
    const c = unoCard(card);
    if (!c.color) setWild(card);
    else void play(card);
  };

  const seats = pub.players.map((id) => ({
    id,
    active: pub.phase === "play" && pub.turn === id,
    detail: (
      <span>
        {pub.handCounts[id]} card{pub.handCounts[id] === 1 ? "" : "s"}
        {pub.handCounts[id] === 1 && <strong className="text-coral"> · UNO</strong>}
      </span>
    ),
    score: pub.scores[id],
  }));

  const status =
    pub.phase === "over"
      ? "Game over"
      : pub.phase === "roundEnd"
        ? `${names[pub.roundWinner ?? ""] ?? "Someone"} went out!`
        : myTurn
          ? pub.pendingDraw
            ? `Your turn — stack a draw card or pick up ${pub.pendingDraw}`
            : priv?.drawn
              ? "You drew a playable card — play it or pass"
              : "Your turn — match the colour or number"
          : `${names[pub.turn] ?? "Player"}'s turn`;

  const canCatch = pub.vulnerable && pub.vulnerable !== me.playerId && pub.phase === "play";

  return (
    <div className="space-y-4">
      <StatusBanner tone={myTurn ? "turn" : pub.phase === "play" ? "wait" : "done"}>{status}</StatusBanner>
      {pub.phase === "play" && <Countdown deadline={game.deadline} forMe={myTurn} />}

      <div className="flex flex-wrap items-center justify-center gap-6 py-2">
        <div className="flex flex-col items-center gap-1">
          <div
            className={cn(
              "shadow-card grid place-items-center rounded-2xl border-[3px] border-white bg-[#1d1d1d] font-black text-[#e5383b]",
              handMode ? "h-[6.2rem] w-[4.2rem]" : "h-36 w-24 text-2xl",
            )}
          >
            UNO
          </div>
          <span className="text-muted text-xs font-semibold">Draw · {pub.deckCount}</span>
        </div>
        <AnimatePresence mode="popLayout">
          <motion.div
            key={pub.top}
            initial={{ scale: 0.5, rotate: -20, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 20 }}
          >
            <UnoCardView id={pub.top} size={handMode ? "md" : "lg"} />
          </motion.div>
        </AnimatePresence>
        <div className="flex flex-col gap-2">
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 font-bold text-white"
            style={{ background: UNO_HEX[pub.color] }}
          >
            Colour: {UNO_COLOR_NAMES[pub.color]}
          </span>
          <span className="text-muted inline-flex items-center gap-1 text-sm">
            <ArrowLeftRight className="size-4" aria-hidden /> {pub.direction === 1 ? "Clockwise" : "Counter-clockwise"}
          </span>
          {pub.pendingDraw > 0 && (
            <span className="bg-rose/20 text-rose rounded-full px-3 py-1 text-sm font-bold">Stack: +{pub.pendingDraw}</span>
          )}
          {pub.last && <span className={cn("font-semibold", !handMode && "text-lg")}>{pub.last.text}</span>}
        </div>
      </div>

      {canCatch && (
        <Button size="lg" variant="danger" className="w-full" onClick={() => send({ type: "catch", target: pub.vulnerable })}>
          🚨 Catch {names[pub.vulnerable!]} — they didn&apos;t say UNO!
        </Button>
      )}
      {handMode && pub.vulnerable === me.playerId && (
        <Button size="xl" variant="danger" className="w-full" onClick={() => send({ type: "uno" })}>
          <Megaphone aria-hidden /> UNO!
        </Button>
      )}

      {pub.phase !== "play" && (
        <>
          <RoundSummaries summaries={game.roundSummaries} names={names} />
          {pub.phase === "roundEnd" && (
            <NextRoundButton room={room} me={me} deadline={game.deadline} onNext={() => send({ type: "next" })} />
          )}
        </>
      )}

      {handMode && (
        <section aria-label="Your hand" className="border-border bg-surface-2/70 rounded-2xl border p-3">
          <p className="text-muted mb-1 text-sm font-semibold">Your hand · {hand.length} cards</p>
          <div className="flex flex-wrap justify-center gap-2 pt-3 pb-1">
            {hand.map((c) => (
              <UnoCardView
                key={c}
                id={c}
                playable={myTurn && playable.has(c)}
                dim={myTurn && !playable.has(c)}
                selected={wild === c}
                onClick={myTurn && playable.has(c) ? () => tap(c) : undefined}
              />
            ))}
          </div>
          {wild && (
            <div className="mt-3 space-y-2">
              <p className="font-semibold">Pick a colour:</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {UNO_COLORS.map((col) => (
                  <button
                    key={col}
                    type="button"
                    className="h-14 rounded-xl text-lg font-bold text-white shadow"
                    style={{ background: UNO_HEX[col] }}
                    onClick={() => play(wild, col)}
                  >
                    {UNO_COLOR_NAMES[col]}
                  </button>
                ))}
              </div>
            </div>
          )}
          {myTurn && (
            <div className="mt-3 flex flex-wrap gap-2">
              {!priv?.drawn ? (
                <Button size="lg" variant="secondary" onClick={() => send({ type: "draw" })}>
                  {pub.pendingDraw ? `Pick up ${pub.pendingDraw}` : "Draw a card"}
                </Button>
              ) : (
                <Button size="lg" variant="secondary" onClick={() => send({ type: "pass" })}>
                  <SkipForward aria-hidden /> Keep it & pass
                </Button>
              )}
              {hand.length === 2 && (
                <Button size="lg" variant={uno ? "danger" : "outline"} onClick={() => setUno((u) => !u)} aria-pressed={uno}>
                  <Megaphone aria-hidden /> {uno ? "UNO called ✓" : "Call UNO with this play"}
                </Button>
              )}
            </div>
          )}
        </section>
      )}

      <Seats
        seats={seats}
        players={room.players}
        names={names}
        meId={me.playerId}
        autopilot={game.autopilot}
        compact={handMode}
      />
      {!handMode && <EventLog entries={pub.log} />}
    </div>
  );
}
