"use client";
import { useState } from "react";
import { ArrowLeftRight, Hand, Layers, SkipForward } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { SheddingPrivate, SheddingPublic } from "@/games/shared/shedding";
import { type Suit, SUITS, SUIT_NAMES, SUIT_SYMBOLS, rankOf } from "@/lib/engine/cards";
import { Button } from "@/components/ui/button";
import { CardFace, DeckPile, PlayingCard } from "./playing-card";
import { Countdown, EventLog, RoundSummaries, Seats, StatusBanner } from "./common";
import { NextRoundButton } from "./next-round";
import type { GameViewProps } from "./types";

function ActiveSuit({ suit }: { suit: Suit }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-3 px-3 py-1 text-sm font-bold">
      Suit to match: <span className="text-lg">{SUIT_SYMBOLS[suit]}</span> {SUIT_NAMES[suit]}
    </span>
  );
}

function Table({ pub, size = "lg" }: { pub: SheddingPublic; size?: "md" | "lg" | "xl" }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-6 py-2">
      <DeckPile count={pub.drawCount} size={size} />
      <div className="flex flex-col items-center gap-1.5">
        <AnimatePresence mode="popLayout">
          {pub.topCard && (
            <motion.div
              key={pub.topCard + pub.discardCount}
              initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 22 }}
            >
              <PlayingCard card={pub.topCard} size={size} />
            </motion.div>
          )}
        </AnimatePresence>
        <span className="text-xs font-semibold text-muted">Discard pile · {pub.discardCount}</span>
      </div>
      <div className="flex flex-col items-start gap-2">
        <ActiveSuit suit={pub.activeSuit} />
        {pub.pendingDraw > 0 && (
          <span className="rounded-full bg-rose/15 px-3 py-1 text-sm font-bold text-rose">Next player draws {pub.pendingDraw}</span>
        )}
        {pub.rules.reverseRank && (
          <span className="inline-flex items-center gap-1 text-sm text-muted">
            <ArrowLeftRight className="size-4" aria-hidden /> Direction: {pub.direction === 1 ? "clockwise" : "counter-clockwise"}
          </span>
        )}
        <span className="text-sm text-muted">Round {pub.round}</span>
      </div>
    </div>
  );
}

export function SheddingView({ pub, priv, mode, room, game, me, names, send }: GameViewProps<SheddingPublic, SheddingPrivate>) {
  const [selected, setSelected] = useState<string | null>(null);
  const [choosingSuit, setChoosingSuit] = useState(false);
  const myTurn = pub.phase === "play" && pub.turn === me.playerId;
  const seats = pub.players.map((id) => ({
    id,
    active: pub.phase === "play" && pub.turn === id,
    detail: <span>{pub.handCounts[id]} cards</span>,
    score: pub.scores[id],
  }));

  const statusText =
    pub.phase === "roundEnd"
      ? `Round over — ${names[pub.roundWinner ?? ""] ?? "someone"} went out!`
      : pub.phase === "over"
        ? "Game over"
        : myTurn
          ? pub.pendingDraw > 0
            ? `Your turn — play a ${pub.rules.drawTwoRank} or draw ${pub.pendingDraw}`
            : pub.drewThisTurn
              ? "Your turn — play a card or pass"
              : "Your turn — play a card or draw"
          : `${names[pub.turn] ?? "Player"}'s turn`;

  const shared = (
    <>
      {pub.phase === "roundEnd" && (
        <div className="space-y-3">
          <RoundSummaries summaries={game.roundSummaries} names={names} />
          <NextRoundButton room={room} me={me} deadline={game.deadline} onNext={() => send({ type: "next" })} />
        </div>
      )}
    </>
  );

  if (mode === "table" || !priv) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StatusBanner tone={pub.phase === "play" ? "neutral" : "done"}>{statusText}</StatusBanner>
          {pub.phase === "play" && <Countdown deadline={game.deadline} total={game.config.turnSeconds} className="w-56" />}
        </div>
        <Table pub={pub} size="xl" />
        {shared}
        <Seats seats={seats} players={room.players} names={names} meId={me.playerId} autopilot={game.autopilot} />
        <EventLog entries={pub.log} />
      </div>
    );
  }

  const playable = new Set(priv.playable);
  const selectedCard = selected && priv.hand.includes(selected) ? selected : null;
  const isWild = selectedCard ? rankOf(selectedCard) === pub.rules.wildRank : false;

  const playSelected = async (suit?: Suit) => {
    if (!selectedCard) return;
    if (isWild && !suit) {
      setChoosingSuit(true);
      return;
    }
    const ok = await send({ type: "play", card: selectedCard, suit });
    if (ok) {
      setSelected(null);
      setChoosingSuit(false);
    }
  };

  return (
    <div className="space-y-4">
      <StatusBanner tone={myTurn ? "turn" : pub.phase === "play" ? "wait" : "done"}>{statusText}</StatusBanner>
      {pub.phase === "play" && <Countdown deadline={game.deadline} total={game.config.turnSeconds} forMe={myTurn} />}
      <div className="flex items-center justify-center gap-4">
        <DeckPile count={pub.drawCount} size="sm" />
        {pub.topCard && <CardFace card={pub.topCard} size="md" />}
        <div className="flex flex-col gap-1 text-sm">
          <ActiveSuit suit={pub.activeSuit} />
          {pub.pendingDraw > 0 && <span className="font-bold text-rose">Draw {pub.pendingDraw} pending</span>}
        </div>
      </div>
      {shared}

      <section aria-label="Your hand" className="rounded-2xl border border-border bg-surface-2/70 p-3">
        <div className="mb-2 flex items-center justify-between text-sm text-muted">
          <span className="font-semibold">Your hand · {priv.hand.length} cards</span>
          {myTurn && <span>Playable cards are underlined in green</span>}
        </div>
        <div className="flex flex-wrap justify-center gap-2 pb-3 pt-4">
          {priv.hand.map((c) => (
            <PlayingCard
              key={c}
              card={c}
              size="md"
              playable={myTurn && playable.has(c)}
              disabled={!myTurn || !playable.has(c)}
              hint={myTurn && playable.has(c) ? "playable" : undefined}
              selected={selectedCard === c}
              onClick={() => {
                setChoosingSuit(false);
                setSelected(selectedCard === c ? null : c);
              }}
            />
          ))}
        </div>
      </section>

      {choosingSuit && selectedCard && (
        <div className="rounded-2xl border border-sky/50 bg-sky/10 p-3" role="group" aria-label="Choose the next suit">
          <p className="mb-2 font-semibold">Choose the next suit</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SUITS.map((s) => (
              <Button key={s} variant="secondary" size="lg" onClick={() => playSelected(s)}>
                <span className="text-2xl" aria-hidden>
                  {SUIT_SYMBOLS[s]}
                </span>
                {SUIT_NAMES[s]}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Button size="lg" disabled={!myTurn || !selectedCard} onClick={() => playSelected()}>
          <Hand aria-hidden /> Play
        </Button>
        <Button size="lg" variant="sky" disabled={!myTurn || pub.drewThisTurn} onClick={() => send({ type: "draw" })}>
          <Layers aria-hidden /> {pub.pendingDraw > 0 ? `Draw ${pub.pendingDraw}` : "Draw"}
        </Button>
        <Button
          size="lg"
          variant="secondary"
          disabled={!myTurn || (!pub.drewThisTurn && pub.drawCount + pub.discardCount > 1)}
          onClick={() => send({ type: "pass" })}
        >
          <SkipForward aria-hidden /> Pass
        </Button>
      </div>
      <Seats seats={seats} players={room.players} names={names} meId={me.playerId} autopilot={game.autopilot} compact />
      <EventLog entries={pub.log} />
    </div>
  );
}
