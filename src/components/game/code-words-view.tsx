"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Eye, Skull } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type CodeWordsPrivate, type CodeWordsPublic, TEAM_LABELS, type Team, type Tile } from "@/games/code-words";
import { cn } from "@/lib/utils";
import { Countdown, EventLog, StatusBanner } from "./common";
import type { GameViewProps } from "./types";

const TILE_STYLE: Record<Tile, string> = {
  A: "bg-[#d63c3c] text-white border-[#ff8a8a]",
  B: "bg-[#2563d6] text-white border-[#8ab4ff]",
  N: "bg-[#d9cdb0] text-[#3b3322] border-[#f1e6c8]",
  X: "bg-[#111] text-white border-[#666]",
};
const HINT_STYLE: Record<Tile, string> = {
  A: "border-[#ff5a5a] text-[#ffb3b3]",
  B: "border-[#5a9bff] text-[#b3d0ff]",
  N: "border-border text-muted",
  X: "border-white bg-black text-white",
};
const TEAM_TEXT = ["text-[#ff6b6b]", "text-[#6ba4ff]"];

export function CodeWordsView({ pub, priv, mode, game, me, names, send }: GameViewProps<CodeWordsPublic, CodeWordsPrivate>) {
  const [clue, setClue] = useState("");
  const [num, setNum] = useState(1);
  const meId = me.playerId;
  const handMode = mode === "hand" && !!priv;
  const myTeam = priv?.team ?? null;
  const spy = !!priv?.spymaster && handMode;
  const waiting = game.pending.includes(meId);
  const canGuess = handMode && waiting && pub.phase === "guess";

  const status =
    pub.phase === "over"
      ? `🏆 ${TEAM_LABELS[pub.winner!]} team wins — ${pub.endReason}`
      : pub.phase === "clue"
        ? waiting
          ? "You're the spymaster — give your team a clue"
          : `${TEAM_LABELS[pub.turnTeam]} spymaster (${names[pub.spymasters[pub.turnTeam]]}) is thinking…`
        : canGuess
          ? `Your team's guess — ${pub.guessesLeft >= 20 ? "unlimited" : pub.guessesLeft} left`
          : `${TEAM_LABELS[pub.turnTeam]} team is guessing`;

  const roster = (t: Team) => pub.players.filter((p) => pub.teams[p] === t);

  return (
    <div className="space-y-4">
      <StatusBanner tone={pub.phase === "over" ? "done" : waiting ? "turn" : "wait"}>{status}</StatusBanner>
      {pub.phase !== "over" && <Countdown deadline={game.deadline} forMe={waiting} />}

      <div className="grid grid-cols-2 gap-2">
        {([0, 1] as Team[]).map((t) => (
          <div
            key={t}
            className={cn(
              "rounded-xl border-2 p-2",
              t === 0 ? "border-[#d63c3c]/60 bg-[#d63c3c]/10" : "border-[#2563d6]/60 bg-[#2563d6]/10",
              pub.turnTeam === t && pub.phase !== "over" && "shadow-[0_0_0_3px_rgba(255,193,69,0.5)]",
            )}
          >
            <p className={cn("font-display text-lg font-extrabold", TEAM_TEXT[t])}>
              {TEAM_LABELS[t]} · {pub.left[t]} left
              {myTeam === t && <span className="text-muted text-xs font-semibold"> (your team)</span>}
            </p>
            <p className="text-sm">
              {roster(t).map((p) => (
                <span key={p} className="mr-2 inline-flex items-center gap-0.5">
                  {pub.spymasters.includes(p) && <Eye className="size-3.5" aria-label="spymaster" />}
                  {names[p]}
                </span>
              ))}
            </p>
          </div>
        ))}
      </div>

      {pub.clue && pub.phase === "guess" && (
        <p className="text-center">
          <span className="text-muted text-sm font-bold uppercase">Clue </span>
          <span
            className={cn("font-display text-3xl font-black tracking-wide", TEAM_TEXT[pub.clue.team], !handMode && "text-5xl")}
          >
            {pub.clue.word} · {pub.clue.number === 0 ? "∞" : pub.clue.number}
          </span>
        </p>
      )}

      {spy && waiting && pub.phase === "clue" && (
        <form
          className="border-amber/60 bg-amber/10 flex flex-wrap items-end gap-2 rounded-2xl border p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await send({ type: "clue", word: clue, number: num })) setClue("");
          }}
        >
          <label className="flex-1">
            <span className="mb-1 block text-sm font-semibold">One-word clue</span>
            <Input
              value={clue}
              onChange={(e) => setClue(e.target.value.replace(/\s/g, ""))}
              maxLength={24}
              placeholder="e.g. OCEAN"
              autoComplete="off"
            />
          </label>
          <label>
            <span className="mb-1 block text-sm font-semibold">Number</span>
            <select
              value={num}
              onChange={(e) => setNum(Number(e.target.value))}
              className="bg-surface-2 border-border h-11 rounded-xl border px-3"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "∞" : n}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" size="lg" disabled={!clue}>
            Give clue
          </Button>
        </form>
      )}
      {spy && (
        <p className="text-muted text-center text-sm">
          You&apos;re a spymaster: the coloured borders are the secret key. Don&apos;t let anyone see your phone!
        </p>
      )}

      <div className={cn("grid grid-cols-5", handMode ? "gap-1.5" : "gap-2.5")} role="grid" aria-label="Board">
        {pub.words.map((w, i) => {
          const shown = pub.revealedKey[i];
          const hint = spy && priv?.key ? priv.key[i]! : null;
          const tappable = canGuess && !pub.revealed[i];
          return (
            <motion.button
              key={w + i}
              type="button"
              role="gridcell"
              layout
              disabled={!tappable}
              onClick={() => send({ type: "guess", index: i })}
              aria-label={`${w}${shown ? ` (${shown === "A" ? "red" : shown === "B" ? "blue" : shown === "N" ? "bystander" : "assassin"})` : ""}`}
              className={cn(
                "relative flex items-center justify-center rounded-lg border-2 px-0.5 text-center leading-tight font-extrabold break-words uppercase",
                handMode ? "min-h-14 text-[0.62rem] sm:text-xs" : "min-h-20 text-base xl:min-h-24 xl:text-xl",
                shown && pub.revealed[i]
                  ? TILE_STYLE[shown]
                  : shown
                    ? cn(TILE_STYLE[shown], "opacity-45")
                    : hint
                      ? cn("bg-surface-2 border-[3px]", HINT_STYLE[hint])
                      : "border-[#fff6df] bg-[#f3ead3] text-[#2a2418]",
                tappable && "hover:ring-amber cursor-pointer hover:ring-2",
                pub.lastPick?.index === i && "ring-amber ring-4",
              )}
            >
              {shown === "X" && <Skull className="absolute top-0.5 right-0.5 size-3.5" aria-hidden />}
              {w}
            </motion.button>
          );
        })}
      </div>

      {canGuess && (
        <Button size="lg" variant="secondary" className="w-full" onClick={() => send({ type: "end-guessing" })}>
          We&apos;re done guessing
        </Button>
      )}
      <EventLog entries={pub.log} />
    </div>
  );
}
