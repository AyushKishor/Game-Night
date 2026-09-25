"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RankItPrivate, RankItPublic } from "@/games/rank-it";
import { StatusBanner, Seats } from "./common";
import { LockedIn, PromptHeader, RoundReveal } from "./kit";
import type { GameViewProps } from "./types";

function Orderer({
  items,
  initial,
  onSubmit,
  cta,
}: {
  items: string[];
  initial: number[];
  onSubmit: (order: number[]) => void;
  cta: string;
}) {
  const [order, setOrder] = useState(initial);
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = order.slice();
    [next[i], next[j]] = [next[j]!, next[i]!];
    setOrder(next);
  };
  return (
    <div className="space-y-3">
      <p className="text-muted text-sm">Top = best. Use the arrows to reorder.</p>
      <ol className="space-y-2">
        {order.map((item, i) => (
          <li key={item} className="border-border bg-surface-2 flex items-center gap-2 rounded-xl border p-2">
            <span className="bg-bg-2 grid size-9 place-items-center rounded-lg font-mono font-bold">{i + 1}</span>
            <span className="flex-1 text-lg font-semibold">{items[item]}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Move ${items[item]} up`}
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              <ArrowUp />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Move ${items[item]} down`}
              disabled={i === order.length - 1}
              onClick={() => move(i, 1)}
            >
              <ArrowDown />
            </Button>
          </li>
        ))}
      </ol>
      <Button size="lg" className="w-full" onClick={() => onSubmit(order)}>
        <Send aria-hidden /> {cta}
      </Button>
    </div>
  );
}

export function RankItView({ pub, priv, mode, room, game, me, names, send }: GameViewProps<RankItPublic, RankItPrivate>) {
  const handMode = mode === "hand" && !!priv;
  const ranker = names[pub.ranker] ?? "Player";
  const canRank = handMode && pub.phase === "rank" && priv!.isRanker;
  const canGuess = handMode && pub.phase === "guess" && !priv!.isRanker && !priv!.myOrder;
  const guessers = pub.players.filter((p) => p !== pub.ranker);
  return (
    <div className="space-y-4">
      <PromptHeader
        label={`Round ${pub.round} of ${pub.total} · Ranker: ${ranker}`}
        prompt={pub.prompt}
        sub={
          pub.phase === "rank"
            ? `${ranker} is ranking in secret…`
            : pub.phase === "guess"
              ? `Guess ${ranker}'s order!`
              : undefined
        }
        game={game}
        forMe={canRank || canGuess}
      />
      {canRank && (
        <Orderer
          items={pub.items}
          initial={pub.display}
          onSubmit={(o) => send({ type: "rank", order: o })}
          cta="Lock in my ranking"
        />
      )}
      {canGuess && (
        <Orderer
          items={pub.items}
          initial={pub.display}
          onSubmit={(o) => send({ type: "guess", order: o })}
          cta="Lock in my guess"
        />
      )}
      {handMode && priv!.myOrder && pub.phase !== "reveal" && (
        <StatusBanner tone="done">Locked in — waiting for the others.</StatusBanner>
      )}
      {!canRank && !canGuess && pub.phase !== "reveal" && pub.phase !== "over" && (
        <ul className="grid gap-2 sm:grid-cols-5">
          {pub.display.map((i) => (
            <li key={i} className="bg-surface-2 rounded-xl p-3 text-center font-semibold">
              {pub.items[i]}
            </li>
          ))}
        </ul>
      )}
      {pub.phase === "guess" && <LockedIn players={guessers} done={pub.guessed} room={room} names={names} label="Guessed" />}
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
          <ol className="space-y-1">
            {pub.last.order.map((item, pos) => (
              <li key={item} className="flex items-center gap-2">
                <span className="bg-bg-2 grid size-7 place-items-center rounded-md font-mono text-sm font-bold">{pos + 1}</span>
                <span className="font-semibold">{pub.items[item]}</span>
                <span className="text-muted text-sm">
                  {Object.entries(pub.last!.guesses)
                    .filter(([, g]) => g[pos] === item)
                    .map(([p]) => names[p])
                    .join(", ") || ""}
                </span>
              </li>
            ))}
          </ol>
        </RoundReveal>
      )}
      <Seats
        seats={pub.players.map((id) => ({
          id,
          score: pub.scores[id],
          active: id === pub.ranker,
          detail: id === pub.ranker ? <span>Ranker</span> : undefined,
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
