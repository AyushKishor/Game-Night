"use client";
import { useState } from "react";
import { Send, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CaptionPrivate, CaptionPublic } from "@/games/caption-clash";
import { CAPTION_MAX } from "@/lib/shared/text";
import { Seats, StatusBanner } from "./common";
import { ChoiceGrid, LockedIn, PromptHeader, RoundReveal } from "./kit";
import type { GameViewProps } from "./types";

export function CaptionView({ pub, priv, mode, room, game, me, names, send }: GameViewProps<CaptionPublic, CaptionPrivate>) {
  const [text, setText] = useState("");
  const handMode = mode === "hand" && !!priv;
  return (
    <div className="space-y-4">
      <PromptHeader
        label={`Round ${pub.round} of ${pub.total}`}
        prompt={pub.scenario}
        game={game}
        forMe={handMode && ((pub.phase === "write" && !priv!.caption) || (pub.phase === "vote" && !priv!.vote))}
      />
      {handMode && pub.phase === "write" && !priv!.caption && (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await send({ type: "caption", text })) setText("");
          }}
        >
          <label htmlFor="caption" className="text-muted text-sm font-semibold">
            Your caption ({text.length}/{CAPTION_MAX})
          </label>
          <textarea
            id="caption"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={CAPTION_MAX}
            rows={3}
            className="border-border bg-bg-2 w-full rounded-xl border p-3 text-lg"
            placeholder="Make them laugh…"
          />
          <Button type="submit" size="lg" className="w-full">
            <Send aria-hidden /> Submit caption
          </Button>
        </form>
      )}
      {handMode && pub.phase === "write" && priv!.caption && (
        <StatusBanner tone="done">Submitted: “{priv!.caption}”</StatusBanner>
      )}
      {pub.phase === "write" && (
        <LockedIn players={pub.players} done={pub.submitted} room={room} names={names} label="Captions in" />
      )}
      {pub.phase === "vote" && pub.ballot && (
        <>
          <p className="text-muted text-center">Vote for your favourite — names are hidden.</p>
          <ChoiceGrid
            columns={1}
            options={pub.ballot.map((b) => ({
              key: b.id,
              label: `“${b.text}”`,
              sub: handMode && b.id === priv!.myId ? "Your caption" : undefined,
            }))}
            selected={handMode ? priv!.vote : null}
            disabled={!handMode || !!priv!.vote}
            onPick={handMode ? (k) => (k === priv!.myId ? undefined : send({ type: "vote", id: k })) : undefined}
          />
          <LockedIn players={pub.players} done={pub.submitted} room={room} names={names} label="Voted" />
        </>
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
          <ol className="space-y-2">
            {pub.last.entries.map((e, i) => (
              <li key={e.id} className="bg-bg-2/70 rounded-xl p-3">
                <p className="text-lg font-semibold">
                  {i === 0 && e.votes > 0 && <Trophy className="text-amber mr-1 inline size-5" aria-label="Top caption" />}“
                  {e.text}”
                </p>
                <p className="text-muted text-sm">
                  {names[e.author]} · {e.votes} vote{e.votes === 1 ? "" : "s"}
                </p>
              </li>
            ))}
          </ol>
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
