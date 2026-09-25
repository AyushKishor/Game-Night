"use client";
import { Check, Play, SkipForward, Siren } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ClueRushPrivate, ClueRushPublic } from "@/games/clue-rush";
import { cn } from "@/lib/utils";
import { Countdown, StatusBanner } from "./common";
import { RoundReveal } from "./kit";
import type { GameViewProps } from "./types";

const TEAM_STYLE = ["border-coral bg-coral/10", "border-sky bg-sky/10"];

export function ClueRushView({ pub, priv, mode, room, game, me, names, send }: GameViewProps<ClueRushPublic, ClueRushPrivate>) {
  const handMode = mode === "hand" && !!priv;
  const giverName = names[pub.giver] ?? "Player";
  const team = pub.teamNames[pub.activeTeam];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {pub.teamNames.map((t, i) => (
          <div
            key={t}
            className={cn(
              "rounded-2xl border-2 p-4 text-center",
              TEAM_STYLE[i],
              pub.activeTeam === i && pub.phase !== "over" && "ring-amber/60 ring-4",
            )}
          >
            <p className="font-display text-lg font-bold">{t}</p>
            <p className="font-mono text-4xl font-extrabold">{pub.teamScores[i]}</p>
            <p className="text-muted mt-1 text-sm">
              {pub.players
                .filter((p) => pub.teamOf[p] === i)
                .map((p) => names[p])
                .join(", ")}
            </p>
          </div>
        ))}
      </div>
      <StatusBanner tone={pub.phase === "clue" ? "turn" : "neutral"}>
        Turn {pub.turn} of {pub.totalTurns}: {giverName} describes for {team}
        {pub.phase === "clue" && ` · ${pub.got} got${pub.buzzed ? ` · ${pub.buzzed} buzzed` : ""}`}
      </StatusBanner>
      {(pub.phase === "ready" || pub.phase === "clue") && (
        <Countdown
          deadline={game.deadline}
          total={pub.phase === "clue" ? game.config.roundSeconds : 30}
          forMe={handMode && priv!.role === "giver"}
        />
      )}

      {handMode && priv!.role === "giver" && pub.phase === "ready" && (
        <Button size="xl" className="w-full" onClick={() => send({ type: "start" })}>
          <Play aria-hidden /> Start my turn
        </Button>
      )}
      {handMode && priv!.card && (
        <div className="border-amber bg-surface-2 rounded-3xl border-2 p-6 text-center">
          <p className="text-muted text-sm font-bold tracking-wider uppercase">
            {priv!.role === "giver" ? "Describe" : "They're describing — watch for forbidden words"}
          </p>
          <p className="font-display mt-1 text-5xl font-extrabold">{priv!.card.word}</p>
          <p className="text-rose mt-4 text-sm font-bold tracking-wider uppercase">Don&apos;t say</p>
          <ul className="mt-1 flex flex-wrap justify-center gap-2">
            {priv!.card.taboo.map((t) => (
              <li key={t} className="bg-rose/15 text-rose rounded-full px-3 py-1 font-semibold">
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}
      {handMode && priv!.role === "giver" && pub.phase === "clue" && (
        <div className="grid grid-cols-2 gap-3">
          <Button size="xl" variant="mint" onClick={() => send({ type: "got" })}>
            <Check aria-hidden /> Got it
          </Button>
          <Button size="xl" variant="secondary" onClick={() => send({ type: "skip" })}>
            <SkipForward aria-hidden /> Skip
          </Button>
        </div>
      )}
      {handMode && priv!.role === "watcher" && pub.phase === "clue" && (
        <Button size="xl" variant="danger" className="w-full" onClick={() => send({ type: "buzz" })}>
          <Siren aria-hidden /> Buzz! They said a forbidden word
        </Button>
      )}
      {handMode && priv!.role === "guesser" && pub.phase === "clue" && (
        <StatusBanner tone="turn">Shout your guesses out loud!</StatusBanner>
      )}
      {!handMode && pub.phase === "ready" && (
        <p className="font-display text-center text-2xl font-bold" role="status">
          {giverName}, grab your phone and press Start. {team}: get ready to shout!
        </p>
      )}
      {!handMode && pub.phase === "clue" && (
        <p className="font-display text-amber text-center text-3xl font-extrabold" role="status">
          {team}: shout your guesses!
        </p>
      )}
      {(pub.phase === "turnEnd" || pub.phase === "over") && (
        <RoundReveal
          scores={pub.scores}
          summary={game.roundSummaries.at(-1)}
          room={room}
          me={me}
          game={game}
          names={names}
          onNext={() => send({ type: "next" })}
        >
          <ul className="flex flex-wrap gap-2">
            {pub.finished.map((w, i) => (
              <li
                key={i}
                className={cn(
                  "rounded-full px-3 py-1 font-semibold",
                  w.result === "got"
                    ? "bg-mint/20 text-mint"
                    : w.result === "buzz"
                      ? "bg-rose/20 text-rose"
                      : "bg-surface-3 text-muted",
                )}
              >
                {w.result === "got" ? "✓" : w.result === "buzz" ? "✗" : "↷"} {w.word}
              </li>
            ))}
          </ul>
        </RoundReveal>
      )}
    </div>
  );
}
