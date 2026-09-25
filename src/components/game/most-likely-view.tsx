"use client";
import type { MostLikelyPublic } from "@/games/most-likely";
import { Seats } from "./common";
import { ChoiceGrid, LockedIn, PromptHeader, RoundReveal } from "./kit";
import type { GameViewProps } from "./types";

export function MostLikelyView({
  pub,
  priv,
  mode,
  room,
  game,
  me,
  names,
  send,
}: GameViewProps<MostLikelyPublic, { vote: string | null }>) {
  const voting = pub.phase === "vote";
  const handMode = mode === "hand" && !!priv;
  const counts = pub.votes
    ? Object.values(pub.votes).reduce<Record<string, number>>((m, t) => ({ ...m, [t]: (m[t] ?? 0) + 1 }), {})
    : undefined;
  const avatar = (id: string) => room.players.find((p) => p.id === id)?.avatar ?? "👤";
  return (
    <div className="space-y-4">
      <PromptHeader
        label={`Prompt ${pub.round} of ${pub.total}`}
        prompt={pub.prompt}
        game={game}
        forMe={voting && handMode && !priv?.vote}
        big
      />
      <ChoiceGrid
        options={pub.players.map((id) => ({
          key: id,
          label: `${avatar(id)} ${names[id] ?? "Player"}${id === me.playerId ? " (you)" : ""}`,
        }))}
        selected={handMode ? priv?.vote : null}
        counts={counts}
        disabled={!handMode || !voting || !!priv?.vote}
        onPick={handMode ? (k) => send({ type: "vote", target: k }) : undefined}
      />
      {voting ? (
        <LockedIn players={pub.players} done={pub.voted} room={room} names={names} label="Voted" />
      ) : (
        <RoundReveal
          summary={game.roundSummaries.at(-1)}
          room={room}
          me={me}
          game={game}
          names={names}
          onNext={() => send({ type: "next" })}
        />
      )}
      <Seats
        seats={pub.players.map((id) => ({
          id,
          score: pub.scores[id],
          detail: pub.picked[id] ? <span>picked {pub.picked[id]}×</span> : undefined,
        }))}
        players={room.players}
        names={names}
        meId={me.playerId}
        autopilot={game.autopilot}
        compact={mode === "hand"}
      />
    </div>
  );
}
