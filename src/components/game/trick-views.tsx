"use client";
import { useState } from "react";
import { ArrowRightLeft, Hand } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HeartsPrivate, HeartsPublic } from "@/games/hearts";
import type { SpadesPrivate, SpadesPublic } from "@/games/spades";
import type { TrickPlay } from "@/games/shared/tricks";
import { TEAM_NAMES } from "@/games/shared/party";
import { cn } from "@/lib/utils";
import { Countdown, EventLog, RoundSummaries, Seats, StatusBanner } from "./common";
import { HandPicker } from "./kit";
import { NextRoundButton } from "./next-round";
import { PlayingCard } from "./playing-card";
import type { GameViewProps } from "./types";

function TrickArea({
  trick,
  last,
  names,
  size = "lg",
}: {
  trick: TrickPlay[];
  last: { plays: TrickPlay[]; winner: string } | null;
  names: Record<string, string>;
  size?: "md" | "lg";
}) {
  const showing = trick.length ? trick : (last?.plays ?? []);
  return (
    <div className="border-border rounded-2xl border bg-[radial-gradient(circle_at_center,rgba(61,220,151,0.12),transparent_70%)] p-4">
      <p className="text-muted mb-2 text-center text-sm">
        {trick.length ? "Current trick" : last ? `Last trick — won by ${names[last.winner]}` : "Waiting for the lead"}
      </p>
      <div className="flex min-h-32 flex-wrap items-end justify-center gap-4">
        {showing.map((t) => (
          <div key={t.player + t.card} className={cn("flex flex-col items-center gap-1", !trick.length && "opacity-70")}>
            <PlayingCard card={t.card} size={size} />
            <span className="text-sm font-semibold">{names[t.player]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function usePlay(send: (a: object) => Promise<boolean>) {
  const [sel, setSel] = useState<string | null>(null);
  return {
    sel,
    toggle: (c: string) => setSel((s) => (s === c ? null : c)),
    play: async () => {
      if (sel && (await send({ type: "play", card: sel }))) setSel(null);
    },
  };
}

export function HeartsView({ pub, priv, mode, room, game, me, names, send }: GameViewProps<HeartsPublic, HeartsPrivate>) {
  const [passSel, setPassSel] = useState<string[]>([]);
  const { sel, toggle, play } = usePlay(send);
  const myTurn = pub.phase === "play" && pub.turn === me.playerId;
  const handMode = mode === "hand" && !!priv;
  const seats = pub.players.map((id) => ({
    id,
    active: pub.phase === "play" && pub.turn === id,
    done: pub.phase === "pass" && pub.passed.includes(id),
    detail: (
      <span>
        {pub.handCounts[id]} cards · {pub.roundPoints[id]} pts this round
      </span>
    ),
    score: pub.scores[id],
  }));
  const status =
    pub.phase === "pass"
      ? `Pass three cards ${pub.passDir}`
      : pub.phase === "play"
        ? myTurn
          ? "Your turn — play a card"
          : `${names[pub.turn]}'s turn`
        : "Round over";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusBanner tone={myTurn || (pub.phase === "pass" && handMode && !priv!.passed) ? "turn" : "neutral"}>
          {status}
        </StatusBanner>
        <span className="text-muted text-sm">
          Round {pub.round} · Hearts {pub.heartsBroken ? "broken ♥" : "not broken yet"}
        </span>
      </div>
      {pub.phase !== "roundEnd" && pub.phase !== "over" && <Countdown deadline={game.deadline} forMe={myTurn} />}
      <TrickArea trick={pub.trick} last={pub.lastTrick} names={names} size={handMode ? "md" : "lg"} />
      {pub.phase === "roundEnd" && (
        <div className="space-y-3">
          <RoundSummaries summaries={game.roundSummaries} names={names} />
          <NextRoundButton room={room} me={me} deadline={game.deadline} onNext={() => send({ type: "next" })} />
        </div>
      )}
      {handMode && priv && (
        <>
          {pub.phase === "pass" && !priv.passed && (
            <>
              <HandPicker
                hand={priv.hand}
                selected={passSel}
                onToggle={(c) => setPassSel((s) => (s.includes(c) ? s.filter((x) => x !== c) : s.length < 3 ? [...s, c] : s))}
                label={`Choose 3 cards to pass to ${names[priv.passTo ?? ""] ?? "a player"}`}
              />
              <Button
                size="lg"
                className="w-full"
                disabled={passSel.length !== 3}
                onClick={async () => (await send({ type: "pass", cards: passSel })) && setPassSel([])}
              >
                <ArrowRightLeft aria-hidden /> Pass {passSel.length}/3 cards
              </Button>
            </>
          )}
          {pub.phase === "pass" && priv.passed && <StatusBanner tone="done">Passed — waiting for the others.</StatusBanner>}
          {pub.phase !== "pass" && (
            <>
              {priv.received.length > 0 && (
                <p className="text-muted text-center text-sm">You received: {priv.received.join(" ")}</p>
              )}
              <HandPicker
                hand={priv.hand}
                playable={myTurn ? priv.legal : []}
                selected={sel ? [sel] : []}
                onToggle={myTurn ? toggle : undefined}
                disabled={!myTurn}
              />
              <Button size="lg" className="w-full" disabled={!myTurn || !sel} onClick={play}>
                <Hand aria-hidden /> Play card
              </Button>
            </>
          )}
        </>
      )}
      <Seats
        seats={seats}
        players={room.players}
        names={names}
        meId={me.playerId}
        autopilot={game.autopilot}
        compact={handMode}
      />
      {!handMode && <EventLog entries={pub.log} />}
    </div>
  );
}

export function SpadesView({ pub, priv, mode, room, game, me, names, send }: GameViewProps<SpadesPublic, SpadesPrivate>) {
  const { sel, toggle, play } = usePlay(send);
  const [bid, setBid] = useState(3);
  const myTurn = (pub.phase === "play" || pub.phase === "bid") && pub.turn === me.playerId;
  const handMode = mode === "hand" && !!priv;
  const teamLabel = (id: string) => (pub.teams === 2 ? TEAM_NAMES[pub.teamOf[id]!] : "Solo");
  const seats = pub.players.map((id) => ({
    id,
    active: (pub.phase === "play" || pub.phase === "bid") && pub.turn === id,
    detail: (
      <span>
        {teamLabel(id)} · bid {pub.bids[id] === null ? "?" : pub.bids[id] === 0 ? "nil" : pub.bids[id]} · won {pub.tricksWon[id]}
      </span>
    ),
    score: pub.scores[id],
  }));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusBanner tone={myTurn ? "turn" : "neutral"}>
          {pub.phase === "bid"
            ? myTurn
              ? "Your bid"
              : `${names[pub.turn]} is bidding`
            : pub.phase === "play"
              ? myTurn
                ? "Your turn — play a card"
                : `${names[pub.turn]}'s turn`
              : "Round over"}
        </StatusBanner>
        <span className="text-muted text-sm">
          Round {pub.round} · Spades {pub.spadesBroken ? "broken ♠" : "not broken yet"}
        </span>
      </div>
      {pub.teams === 2 && (
        <div className="grid grid-cols-2 gap-3">
          {[0, 1].map((t) => (
            <div key={t} className="bg-surface-2 rounded-xl p-3 text-center">
              <p className="font-bold">{TEAM_NAMES[t]}</p>
              <p className="font-mono text-3xl font-extrabold">{pub.teamScores[t]}</p>
              <p className="text-muted text-xs">{pub.teamBags[t]} bags</p>
            </div>
          ))}
        </div>
      )}
      {pub.phase !== "roundEnd" && pub.phase !== "over" && <Countdown deadline={game.deadline} forMe={myTurn} />}
      <TrickArea trick={pub.trick} last={pub.lastTrick} names={names} size={handMode ? "md" : "lg"} />
      {pub.phase === "roundEnd" && (
        <div className="space-y-3">
          <RoundSummaries summaries={game.roundSummaries} names={names} />
          <NextRoundButton room={room} me={me} deadline={game.deadline} onNext={() => send({ type: "next" })} />
        </div>
      )}
      {handMode && priv && (
        <>
          <HandPicker
            hand={priv.hand}
            playable={pub.phase === "play" && myTurn ? priv.legal : []}
            selected={sel ? [sel] : []}
            onToggle={pub.phase === "play" && myTurn ? toggle : undefined}
            disabled={pub.phase !== "play" || !myTurn}
          />
          {pub.phase === "bid" && myTurn ? (
            <div className="border-amber/60 bg-amber/10 rounded-2xl border p-4">
              <p className="font-semibold">How many tricks will you win?</p>
              <div className="mt-2 flex items-center gap-3">
                <Button variant="secondary" size="icon" aria-label="Lower bid" onClick={() => setBid((b) => Math.max(0, b - 1))}>
                  −
                </Button>
                <span className="w-16 text-center font-mono text-3xl font-bold" aria-live="polite">
                  {bid === 0 ? "Nil" : bid}
                </span>
                <Button variant="secondary" size="icon" aria-label="Raise bid" onClick={() => setBid((b) => Math.min(13, b + 1))}>
                  +
                </Button>
                <Button size="lg" className="ml-auto" onClick={() => send({ type: "bid", bid })}>
                  Bid {bid === 0 ? "nil" : bid}
                </Button>
              </div>
            </div>
          ) : (
            <Button size="lg" className="w-full" disabled={pub.phase !== "play" || !myTurn || !sel} onClick={play}>
              <Hand aria-hidden /> Play card
            </Button>
          )}
        </>
      )}
      <Seats
        seats={seats}
        players={room.players}
        names={names}
        meId={me.playerId}
        autopilot={game.autopilot}
        compact={handMode}
      />
      {!handMode && <EventLog entries={pub.log} />}
    </div>
  );
}
