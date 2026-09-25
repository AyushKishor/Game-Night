"use client";
import { useState } from "react";
import { Flag, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { QuickCatPrivate, QuickCatPublic } from "@/games/quick-categories";
import { ANSWER_MAX } from "@/lib/shared/text";
import { cn } from "@/lib/utils";
import { Seats, StatusBanner } from "./common";
import { LockedIn, PromptHeader, RoundReveal } from "./kit";
import type { GameViewProps } from "./types";

export function QuickCategoriesView({
  pub,
  priv,
  mode,
  room,
  game,
  me,
  names,
  send,
}: GameViewProps<QuickCatPublic, QuickCatPrivate>) {
  const [text, setText] = useState("");
  const handMode = mode === "hand" && !!priv;
  const answered = handMode && priv!.answer !== null;
  const doneReviewing = pub.done.includes(me.playerId);
  return (
    <div className="space-y-4">
      <PromptHeader
        label={`Round ${pub.round} of ${pub.total}`}
        prompt={
          <>
            {pub.category}
            <span
              className="bg-amber ml-3 inline-grid size-14 place-items-center rounded-2xl align-middle font-mono text-4xl text-[#2a1c00]"
              aria-label={`Letter ${pub.letter}`}
            >
              {pub.letter}
            </span>
          </>
        }
        sub={
          pub.phase === "answer"
            ? `Something that starts with “${pub.letter}”`
            : pub.phase === "review"
              ? "Flag answers that don't fit"
              : undefined
        }
        game={game}
        forMe={handMode && ((pub.phase === "answer" && !answered) || (pub.phase === "review" && !doneReviewing))}
        big
      />
      {handMode && pub.phase === "answer" && !answered && (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await send({ type: "answer", text })) setText("");
          }}
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={ANSWER_MAX}
            placeholder={`${pub.letter}…`}
            aria-label="Your answer"
            autoComplete="off"
          />
          <Button type="submit" size="lg">
            <Send aria-hidden /> Send
          </Button>
          <Button type="button" variant="ghost" size="lg" onClick={() => send({ type: "skip" })}>
            Pass
          </Button>
        </form>
      )}
      {handMode && pub.phase === "answer" && answered && (
        <StatusBanner tone="done">Your answer: {priv!.answer || "(passed)"}</StatusBanner>
      )}
      {pub.phase === "answer" && (
        <LockedIn players={pub.players} done={pub.submitted} room={room} names={names} label="Answered" />
      )}
      {pub.phase === "review" && pub.answers && (
        <div className="space-y-2">
          <ul className="grid gap-2 sm:grid-cols-2">
            {Object.entries(pub.answers).map(([author, answer]) => {
              const flagged = priv?.flagged.includes(author) ?? false;
              const mine = author === me.playerId;
              return (
                <li
                  key={author}
                  className={cn(
                    "bg-surface-2 flex items-center gap-3 rounded-xl border p-3",
                    flagged ? "border-rose" : "border-border",
                  )}
                >
                  <div className="flex-1">
                    <p className="text-xl font-bold">{answer}</p>
                    <p className="text-muted text-sm">
                      {names[author]} · {pub.flagCounts?.[author] ?? 0} flag{pub.flagCounts?.[author] === 1 ? "" : "s"}
                    </p>
                  </div>
                  {handMode && !mine && !doneReviewing && (
                    <Button
                      variant={flagged ? "danger" : "secondary"}
                      size="sm"
                      aria-pressed={flagged}
                      onClick={() => send({ type: "flag", author, flagged: !flagged })}
                    >
                      <Flag aria-hidden /> {flagged ? "Flagged" : "Doesn't fit"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          {handMode && !doneReviewing && (
            <Button size="lg" variant="mint" className="w-full" onClick={() => send({ type: "done" })}>
              Done reviewing
            </Button>
          )}
          <LockedIn players={pub.players} done={pub.done} room={room} names={names} label="Done reviewing" />
        </div>
      )}
      {pub.last && (
        <RoundReveal
          summary={game.roundSummaries.at(-1)}
          room={room}
          me={me}
          game={game}
          names={names}
          onNext={() => send({ type: "next" })}
        >
          <ul className="grid gap-1 sm:grid-cols-2">
            {pub.players.map((p) => (
              <li key={p} className={cn(!pub.last!.valid[p] && "text-muted line-through")}>
                <strong>{names[p]}</strong>: {pub.last!.answers[p] || "—"}{" "}
                <span className="no-underline">+{pub.last!.gained[p]}</span>
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
