"use client";
import type { QuizPrivate, QuizPublic } from "@/games/shared/quiz";
import { EventLog, Seats } from "./common";
import { ChoiceGrid, LockedIn, PromptHeader, RoundReveal } from "./kit";
import type { GameViewProps } from "./types";

export function QuizView({ pub, priv, mode, room, game, me, names, send }: GameViewProps<QuizPublic, QuizPrivate>) {
  const answering = pub.phase === "question";
  const myChoice = priv?.choice ?? null;
  const counts = pub.picks
    ? Object.values(pub.picks).reduce<Record<number, number>>((m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }), {})
    : undefined;
  const header = (
    <PromptHeader
      label={`${pub.category} · ${pub.number} of ${pub.total}`}
      prompt={
        pub.display ? (
          <>
            <span className="block text-6xl leading-tight sm:text-7xl" role="img" aria-label="Emoji clue">
              {pub.display}
            </span>
            <span className="text-muted mt-3 block text-xl sm:text-2xl">{pub.prompt}</span>
          </>
        ) : (
          pub.prompt
        )
      }
      game={game}
      forMe={answering && !!priv && myChoice === null}
      big
    />
  );
  const seats = pub.players.map((id) => ({
    id,
    score: pub.scores[id],
    done: answering && pub.answered.includes(id),
    detail: pub.teamMode ? <span>{pub.teamNames[pub.teamOf[id]!]}</span> : undefined,
  }));
  const options = pub.choices.map((c, i) => ({ key: i, label: c }));
  const handMode = mode === "hand" && !!priv;
  return (
    <div className="space-y-4">
      {header}
      <ChoiceGrid
        options={options}
        selected={handMode ? myChoice : null}
        correct={pub.answer}
        counts={counts}
        disabled={!handMode || !answering || myChoice !== null}
        onPick={handMode ? (k) => send({ type: "answer", choice: k }) : undefined}
      />
      {handMode && answering && myChoice !== null && (
        <p className="text-mint text-center font-semibold" role="status">
          Answer locked in!
        </p>
      )}
      {answering ? (
        <LockedIn players={pub.players} done={pub.answered} room={room} names={names} label="Answered" />
      ) : (
        <RoundReveal
          scores={pub.scores}
          badges={Object.fromEntries(
            Object.entries(pub.streaks ?? {})
              .filter(([, n]) => n >= 2)
              .map(([p, n]) => [p, `🔥${n}`]),
          )}
          summary={game.roundSummaries.at(-1)}
          room={room}
          me={me}
          game={game}
          names={names}
          onNext={() => send({ type: "next" })}
        />
      )}
      {pub.teamMode && (
        <div className="grid grid-cols-2 gap-3">
          {pub.teamNames.map((t, i) => {
            const member = pub.players.find((p) => pub.teamOf[p] === i);
            return (
              <div key={t} className="bg-surface-2 rounded-xl p-3 text-center">
                <p className="font-bold">{t}</p>
                <p className="font-mono text-3xl font-extrabold">{member ? pub.scores[member] : 0}</p>
              </div>
            );
          })}
        </div>
      )}
      <Seats
        seats={seats}
        players={room.players}
        names={names}
        meId={me.playerId}
        autopilot={game.autopilot}
        compact={mode === "hand"}
      />
      {mode === "table" && <EventLog entries={pub.log} />}
    </div>
  );
}
