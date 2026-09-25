"use client";
import { useState } from "react";
import { Eye, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SecretSignalPrivate, SecretSignalPublic } from "@/games/secret-signal";
import { CLUE_MAX } from "@/lib/shared/text";
import { Seats, StatusBanner } from "./common";
import { ChoiceGrid, LockedIn, PromptHeader, RoundReveal } from "./kit";
import type { GameViewProps } from "./types";

export function SecretSignalView({
  pub,
  priv,
  mode,
  room,
  game,
  me,
  names,
  send,
}: GameViewProps<SecretSignalPublic, SecretSignalPrivate>) {
  const [clue, setClue] = useState("");
  const [peek, setPeek] = useState(false);
  const handMode = mode === "hand" && !!priv;
  const needGuess = pub.players;
  return (
    <div className="space-y-4">
      <PromptHeader
        label={`Round ${pub.round} of ${pub.total}`}
        prompt={
          pub.phase === "clue"
            ? "Give a one-word clue about your secret symbol"
            : pub.phase === "guess"
              ? "Who shares your symbol?"
              : "Signals revealed"
        }
        sub={pub.hasLoner ? "Odd number of players: one of you is the Loner." : undefined}
        game={game}
        forMe={handMode}
      />
      {handMode && priv && pub.phase !== "reveal" && pub.phase !== "over" && (
        <div className="border-violet/50 bg-violet/10 rounded-2xl border p-4 text-center">
          <p className="text-violet text-sm font-bold tracking-wider uppercase">Your secret symbol</p>
          <button
            type="button"
            className="font-display mt-1 text-4xl font-extrabold"
            onClick={() => setPeek(!peek)}
            aria-label={peek ? `Your symbol is ${priv.symbol}. Tap to hide.` : "Tap to reveal your symbol"}
          >
            {peek ? priv.symbol : "••••••"}
          </button>
          <p className="text-muted text-sm">
            <Eye className="mr-1 inline size-4" aria-hidden />
            Tap to {peek ? "hide" : "peek"}.{" "}
            {priv.isLoner ? "You&apos;re the Loner — nobody shares it. Blend in!" : "One other player has the same symbol."}
          </p>
        </div>
      )}
      {handMode && pub.phase === "clue" && !priv!.clue && (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await send({ type: "clue", text: clue })) setClue("");
          }}
        >
          <Input
            value={clue}
            onChange={(e) => setClue(e.target.value.replace(/\s/g, ""))}
            maxLength={CLUE_MAX}
            placeholder="One word"
            aria-label="Your clue"
          />
          <Button type="submit" size="lg">
            <Send aria-hidden /> Send
          </Button>
        </form>
      )}
      {pub.clues && pub.phase === "guess" && (
        <ChoiceGrid
          options={pub.players
            .filter((p) => p !== me.playerId || !handMode)
            .map((p) => ({ key: p, label: `“${pub.clues![p]}”`, sub: names[p] }))}
          selected={handMode ? priv?.guess : null}
          disabled={!handMode || priv!.isLoner || !!priv!.guess}
          onPick={handMode && !priv!.isLoner ? (k) => send({ type: "guess", target: k }) : undefined}
        />
      )}
      {handMode && priv?.isLoner && pub.phase === "guess" && (
        <StatusBanner tone="wait">You&apos;re the Loner — sit tight and hope someone picks you.</StatusBanner>
      )}
      {(pub.phase === "clue" || pub.phase === "guess") && (
        <LockedIn
          players={needGuess}
          done={pub.submitted}
          room={room}
          names={names}
          label={pub.phase === "clue" ? "Clues in" : "Guesses in"}
        />
      )}
      {pub.last && (
        <RoundReveal
          scores={pub.scores}
          summary={game.roundSummaries.at(-1)}
          room={room}
          me={me}
          game={game}
          names={names}
          onNext={() => send({ type: "next" })}
        >
          <ul className="grid gap-1 sm:grid-cols-2">
            {pub.players.map((p) => (
              <li key={p}>
                <strong>{names[p]}</strong> — {pub.last!.symbols[p]}
                {pub.last!.partners[p] ? ` (with ${names[pub.last!.partners[p]!]})` : " (Loner)"}: +{pub.last!.gained[p]}
              </li>
            ))}
          </ul>
        </RoundReveal>
      )}
      <Seats
        seats={pub.players.map((id) => ({ id, score: pub.scores[id] }))}
        players={room.players}
        names={names}
        meId={me.playerId}
        autopilot={game.autopilot}
        compact={mode === "hand"}
      />
    </div>
  );
}
