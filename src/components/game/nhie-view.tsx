"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { NhiePrivate, NhiePublic } from "@/games/never-have-i-ever";
import { cn } from "@/lib/utils";
import { Seats, StatusBanner } from "./common";
import { LockedIn, PromptHeader, RoundReveal } from "./kit";
import type { GameViewProps } from "./types";

export function NhieView({ pub, priv, mode, room, game, me, names, send }: GameViewProps<NhiePublic, NhiePrivate>) {
  const [have, setHave] = useState<boolean | null>(null);
  const handMode = mode === "hand" && !!priv;
  const answering = pub.phase === "answer";
  const n = pub.players.length;
  const canAnswer = handMode && answering && !priv!.answer;
  return (
    <div className="space-y-4">
      <PromptHeader label={`Round ${pub.round} of ${pub.total}`} prompt={pub.prompt} game={game} forMe={canAnswer} big />
      {canAnswer && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Have you?">
            {[
              { v: true, label: "🍺 I HAVE", cls: "border-amber bg-amber/15" },
              { v: false, label: "😇 NEVER", cls: "border-sky bg-sky/15" },
            ].map((o) => (
              <button
                key={String(o.v)}
                type="button"
                role="radio"
                aria-checked={have === o.v}
                onClick={() => setHave(o.v)}
                className={cn(
                  "min-h-20 rounded-2xl border-2 text-2xl font-extrabold",
                  o.cls,
                  have === o.v && "ring-text/80 ring-4",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          {have !== null && (
            <div>
              <p className="mb-2 font-semibold">How many of the {n} of you have done it?</p>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: n + 1 }, (_, i) => i)
                  .filter((i) => !have || i >= 1)
                  .map((i) => (
                    <Button
                      key={i}
                      size="lg"
                      variant="secondary"
                      className="min-w-14 text-xl"
                      onClick={() => send({ type: "answer", have, guess: i })}
                    >
                      {i}
                    </Button>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
      {handMode && answering && priv!.answer && (
        <StatusBanner tone="done">
          Locked in: {priv!.answer.have ? "I have 🍺" : "Never 😇"} · guessed {priv!.answer.guess}
        </StatusBanner>
      )}
      {answering ? (
        <LockedIn players={pub.players} done={pub.answered} room={room} names={names} label="Confessed" />
      ) : (
        pub.last && (
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
              {pub.players.map((p) => (
                <li
                  key={p}
                  className={cn(
                    "rounded-full px-3 py-1 font-semibold",
                    pub.last!.have.includes(p) ? "bg-amber/25 text-amber" : "bg-surface-3 text-muted",
                  )}
                >
                  {pub.last!.have.includes(p) ? "🍺" : "😇"} {names[p]} · guessed {pub.last!.guesses[p] ?? "—"}
                </li>
              ))}
            </ul>
          </RoundReveal>
        )
      )}
      <Seats
        seats={pub.players.map((id) => ({ id, score: pub.scores[id], detail: <span>{pub.confessions[id] ?? 0}× guilty</span> }))}
        players={room.players}
        names={names}
        meId={me.playerId}
        autopilot={game.autopilot}
        compact={mode === "hand"}
      />
    </div>
  );
}
