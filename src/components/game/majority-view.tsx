"use client";
import type { MajorityPublic } from "@/games/majority-rules";
import { Seats } from "./common";
import { ChoiceGrid, LockedIn, PromptHeader, RoundReveal } from "./kit";
import type { GameViewProps } from "./types";

export function MajorityView({
  pub,
  priv,
  mode,
  room,
  game,
  me,
  names,
  send,
}: GameViewProps<MajorityPublic, { vote: "a" | "b" | null }>) {
  const voting = pub.phase === "vote";
  const handMode = mode === "hand" && !!priv;
  const counts = pub.votes
    ? { a: Object.values(pub.votes).filter((v) => v === "a").length, b: Object.values(pub.votes).filter((v) => v === "b").length }
    : undefined;
  const who = (side: "a" | "b") =>
    pub.votes
      ? Object.entries(pub.votes)
          .filter(([, v]) => v === side)
          .map(([p]) => names[p] ?? "Player")
          .join(", ")
      : undefined;
  return (
    <div className="space-y-4">
      <PromptHeader
        label={`Question ${pub.round} of ${pub.total}`}
        prompt={pub.question}
        game={game}
        forMe={voting && handMode && !priv?.vote}
        big
      />
      <ChoiceGrid
        options={[
          { key: "a", label: pub.a, sub: who("a") },
          { key: "b", label: pub.b, sub: who("b") },
        ]}
        selected={handMode ? priv?.vote : null}
        counts={counts}
        disabled={!handMode || !voting || !!priv?.vote}
        onPick={handMode ? (k) => send({ type: "vote", side: k }) : undefined}
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
