"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, Hand, Layers, Megaphone, RefreshCw, SkipForward, ThumbsUp, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BluffPrivate, BluffPublic } from "@/games/bluff";
import type { GoFishPrivate, GoFishPublic } from "@/games/go-fish";
import type { GolfPrivate, GolfPublic } from "@/games/golf";
import type { HigherLowerPrivate, HigherLowerPublic } from "@/games/higher-lower";
import type { MemoryPublic } from "@/games/memory";
import type { OldMaidPrivate, OldMaidPublic } from "@/games/old-maid";
import type { PresidentPrivate, PresidentPublic } from "@/games/president";
import type { SevensPrivate, SevensPublic } from "@/games/sevens";
import type { SnapPublic } from "@/games/snap";
import type { TwentyOnePublic } from "@/games/twenty-one";
import type { WarPublic } from "@/games/war";
import { type CardId, type Rank, RANKS, RANK_NAMES, SUITS, SUIT_NAMES, SUIT_SYMBOLS, cardId, rankOf } from "@/lib/engine/cards";
import { cn } from "@/lib/utils";
import { Countdown, EventLog, RoundSummaries, Seats, StatusBanner } from "./common";
import { ChoiceGrid, HandPicker, LockedIn, RoundReveal } from "./kit";
import { NextRoundButton } from "./next-round";
import { CardBack, CardFace, DeckPile, PlayingCard } from "./playing-card";
import type { GameViewProps } from "./types";

const counts = (ids: string[], c: Record<string, number>, label = "cards") =>
  ids.map((id) => ({
    id,
    detail: (
      <span>
        {c[id]} {label}
      </span>
    ),
  }));

// ───────────────────────── Go Fish ─────────────────────────
export function GoFishView({ pub, priv, mode, room, game, me, names, send }: GameViewProps<GoFishPublic, GoFishPrivate>) {
  const [rank, setRank] = useState<Rank | null>(null);
  const myTurn = !pub.over && pub.turn === me.playerId;
  const handMode = mode === "hand" && !!priv;
  const seats = pub.players.map((id) => ({
    id,
    active: pub.turn === id && !pub.over,
    detail: (
      <span>
        {pub.handCounts[id]} cards · books: {pub.books[id]!.join(" ") || "—"}
      </span>
    ),
    score: pub.books[id]!.length,
  }));
  const last = pub.lastAsk;
  return (
    <div className="space-y-4">
      <StatusBanner tone={myTurn ? "turn" : "neutral"}>
        {myTurn ? "Your turn — ask someone for a rank" : `${names[pub.turn]}'s turn`}
      </StatusBanner>
      <Countdown deadline={game.deadline} forMe={myTurn} />
      <div className="flex items-center justify-center gap-6">
        <DeckPile count={pub.deckCount} label="Pond" size={handMode ? "sm" : "lg"} />
        {last && (
          <p className="max-w-md text-lg">
            <strong>{names[last.asker]}</strong> asked <strong>{names[last.target]}</strong> for {RANK_NAMES[last.rank]}s —{" "}
            {last.got ? (
              <span className="text-mint">got {last.got}!</span>
            ) : (
              <span className="text-sky">Go Fish!{last.drewMatch && " (and fished one up)"}</span>
            )}
          </p>
        )}
      </div>
      {handMode && priv && (
        <>
          <HandPicker
            hand={priv.hand}
            selected={rank ? priv.hand.filter((c) => rankOf(c) === rank) : []}
            onToggle={myTurn ? (c) => setRank(rankOf(c)) : undefined}
            disabled={!myTurn}
          />
          {myTurn && (
            <div className="border-amber/60 bg-amber/10 rounded-2xl border p-3">
              <p className="mb-2 font-semibold">
                {rank ? `Ask for ${RANK_NAMES[rank]}s from…` : "Tap a card to choose a rank, then pick a player"}
              </p>
              <div className="flex flex-wrap gap-2">
                {pub.players
                  .filter((p) => p !== me.playerId && pub.handCounts[p]! > 0)
                  .map((p) => (
                    <Button
                      key={p}
                      size="lg"
                      variant="secondary"
                      disabled={!rank}
                      onClick={async () => (await send({ type: "ask", target: p, rank })) && setRank(null)}
                    >
                      {names[p]}
                    </Button>
                  ))}
              </div>
            </div>
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

// ───────────────────────── Old Maid ─────────────────────────
export function OldMaidView({ pub, priv, mode, room, game, me, names, send }: GameViewProps<OldMaidPublic, OldMaidPrivate>) {
  const myTurn = !pub.loser && pub.turn === me.playerId;
  const handMode = mode === "hand" && !!priv;
  const seats = pub.players.map((id) => ({
    id,
    active: pub.turn === id && !pub.loser,
    out: pub.safe.includes(id),
    detail: <span>{pub.safe.includes(id) ? "Safe!" : `${pub.handCounts[id]} cards`}</span>,
  }));
  const target = pub.drawFrom;
  return (
    <div className="space-y-4">
      <StatusBanner tone={myTurn ? "turn" : "neutral"}>
        {pub.loser
          ? `${names[pub.loser]} is the Old Maid!`
          : myTurn
            ? `Your turn — pick a card from ${names[target ?? ""]}`
            : `${names[pub.turn]} is picking from ${names[target ?? ""]}`}
      </StatusBanner>
      <Countdown deadline={game.deadline} forMe={myTurn} />
      {target && (
        <div className="border-border bg-surface-2/60 rounded-2xl border p-4">
          <p className="text-muted mb-3 text-center">{names[target]}&apos;s hand</p>
          <div className="flex flex-wrap justify-center gap-2">
            {Array.from({ length: pub.handCounts[target] ?? 0 }, (_, i) =>
              myTurn && handMode ? (
                <motion.button
                  key={i}
                  whileHover={{ y: -8 }}
                  type="button"
                  onClick={() => send({ type: "draw", index: i })}
                  aria-label={`Take card ${i + 1}`}
                  className="rounded-xl"
                >
                  <CardBack size="md" />
                </motion.button>
              ) : (
                <CardBack key={i} size={handMode ? "sm" : "md"} />
              ),
            )}
          </div>
        </div>
      )}
      {handMode && priv && (
        <>
          <HandPicker hand={priv.hand} selected={[]} />
          {priv.holdsOldMaid && (
            <p className="text-violet text-center font-semibold">Shh — you&apos;re holding the Old Maid (Q♠).</p>
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

// ───────────────────────── War ─────────────────────────
export function WarView({ pub, priv, mode, room, game, me, names, send }: GameViewProps<WarPublic, { pileCount: number }>) {
  const handMode = mode === "hand" && !!priv;
  const mustFlip = pub.contenders.includes(me.playerId) && !pub.flipped.includes(me.playerId);
  const last = pub.last;
  return (
    <div className="space-y-4">
      <StatusBanner tone={pub.atWar ? "turn" : "neutral"}>
        {pub.atWar ? "WAR! Tied players flip again" : `Battle ${pub.battle} of ${pub.maxBattles}`}
        {pub.potCount > 0 && ` · ${pub.potCount} cards in the pot`}
      </StatusBanner>
      <Countdown deadline={game.deadline} forMe={mustFlip} />
      {last && (
        <div className="flex flex-wrap justify-center gap-4">
          {Object.entries(last.flips).map(([p, c]) => (
            <div
              key={p}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl p-2",
                last.winner === p && "bg-mint/15 ring-mint ring-2",
              )}
            >
              <PlayingCard card={c} size={handMode ? "md" : "xl"} />
              <span className="font-semibold">{names[p]}</span>
            </div>
          ))}
        </div>
      )}
      {handMode && (
        <Button size="xl" className="w-full" disabled={!mustFlip} onClick={() => send({ type: "flip" })}>
          <RefreshCw aria-hidden /> {mustFlip ? "Flip!" : "Waiting for others…"}
        </Button>
      )}
      <LockedIn players={pub.contenders} done={pub.flipped} room={room} names={names} label="Flipped" />
      <Seats
        seats={counts(pub.players, pub.counts).map((s) => ({ ...s, score: pub.counts[s.id], out: pub.counts[s.id] === 0 }))}
        players={room.players}
        names={names}
        meId={me.playerId}
        autopilot={game.autopilot}
        compact={handMode}
      />
    </div>
  );
}

// ───────────────────────── Snap ─────────────────────────
export function SnapView({ pub, priv, mode, room, game, me, names, send }: GameViewProps<SnapPublic, { pileCount: number }>) {
  const handMode = mode === "hand" && !!priv;
  const myTurn = pub.turn === me.playerId;
  const top = pub.top;
  return (
    <div className="space-y-4">
      <StatusBanner tone={myTurn ? "turn" : "neutral"}>
        {myTurn ? "Your turn to flip" : `${names[pub.turn]} flips next`} · flip {pub.flips}/{pub.maxFlips}
      </StatusBanner>
      <div className="flex min-h-40 items-center justify-center gap-3">
        {top.length === 0 && <p className="text-muted">The centre pile is empty.</p>}
        {top.map((c, i) => (
          <motion.div key={c + pub.centerCount + i} initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <PlayingCard card={c} size={handMode ? "lg" : "xl"} />
          </motion.div>
        ))}
        <span className="text-muted text-sm">{pub.centerCount} in the pile</span>
      </div>
      {pub.lastSnap && (
        <p className={cn("text-center font-semibold", pub.lastSnap.correct ? "text-mint" : "text-rose")} role="status">
          {pub.lastSnap.correct
            ? `${names[pub.lastSnap.player]} snapped ${pub.lastSnap.cards} cards!`
            : `${names[pub.lastSnap.player]} snapped too soon.`}
        </p>
      )}
      {handMode && (
        <div className="grid grid-cols-2 gap-3">
          <Button
            size="xl"
            variant="secondary"
            disabled={!myTurn || priv!.pileCount === 0}
            onClick={() => send({ type: "flip" })}
          >
            <Layers aria-hidden /> Flip ({priv!.pileCount})
          </Button>
          <Button
            size="xl"
            variant="primary"
            className="text-2xl"
            disabled={pub.centerCount === 0}
            onClick={() => send({ type: "snap", seen: pub.centerCount })}
          >
            <Zap aria-hidden /> SNAP!
          </Button>
        </div>
      )}
      <Countdown deadline={game.deadline} forMe={myTurn} />
      <Seats
        seats={pub.players.map((id) => ({ id, active: pub.turn === id, score: pub.counts[id] }))}
        players={room.players}
        names={names}
        meId={me.playerId}
        autopilot={game.autopilot}
        compact={handMode}
      />
    </div>
  );
}

// ───────────────────────── Memory ─────────────────────────
export function MemoryView({ pub, mode, room, game, me, names, send }: GameViewProps<MemoryPublic, null>) {
  const myTurn = pub.turn === me.playerId;
  const canFlip = myTurn && pub.players.includes(me.playerId);
  const cols = pub.grid.length <= 16 ? "grid-cols-4" : pub.grid.length <= 24 ? "grid-cols-4 sm:grid-cols-6" : "grid-cols-6";
  return (
    <div className="space-y-4">
      <StatusBanner tone={myTurn ? "turn" : "neutral"}>
        {myTurn ? `Your turn — flip ${pub.flippedThisTurn === 0 ? "two cards" : "one more"}` : `${names[pub.turn]} is flipping`}
      </StatusBanner>
      <Countdown deadline={game.deadline} forMe={myTurn} />
      <div className={cn("mx-auto grid max-w-3xl gap-2", cols)}>
        {pub.grid.map((cell, i) => {
          if (cell.state === "down") {
            return (
              <button
                key={i}
                type="button"
                disabled={!canFlip}
                onClick={() => send({ type: "flip", index: i })}
                aria-label={`Face-down card ${i + 1}`}
                className="flex justify-center rounded-xl disabled:cursor-default"
              >
                <CardBack size={mode === "hand" ? "sm" : "md"} />
              </button>
            );
          }
          return (
            <div
              key={i}
              className={cn("flex justify-center", cell.state === "matched" && "opacity-35")}
              aria-label={cell.state === "matched" ? `Matched by ${names[cell.owner]}` : undefined}
            >
              <PlayingCard card={cell.card} size={mode === "hand" ? "sm" : "md"} />
            </div>
          );
        })}
      </div>
      <Seats
        seats={pub.players.map((id) => ({ id, active: pub.turn === id, score: pub.scores[id] }))}
        players={room.players}
        names={names}
        meId={me.playerId}
        autopilot={game.autopilot}
        compact
      />
    </div>
  );
}

// ───────────────────────── President ─────────────────────────
export function PresidentView({
  pub,
  priv,
  mode,
  room,
  game,
  me,
  names,
  send,
}: GameViewProps<PresidentPublic, PresidentPrivate>) {
  const [sel, setSel] = useState<CardId[]>([]);
  const myTurn = pub.phase === "play" && pub.turn === me.playerId;
  const handMode = mode === "hand" && !!priv;
  const need = pub.pile?.cards.length;
  const seats = pub.players.map((id) => ({
    id,
    active: pub.phase === "play" && pub.turn === id,
    out: pub.finished.includes(id),
    detail: (
      <span>
        {pub.finished.includes(id) ? `Out #${pub.finished.indexOf(id) + 1}` : `${pub.handCounts[id]} cards`}
        {pub.passed.includes(id) && " · passed"}
        {pub.titles[id] && ` · ${pub.titles[id]}`}
      </span>
    ),
    score: pub.scores[id],
  }));
  const toggle = (c: CardId) =>
    setSel((s) =>
      s.includes(c) ? s.filter((x) => x !== c) : s.length && rankOf(s[0]!) !== rankOf(c) ? [c] : [...s, c].slice(0, 4),
    );
  return (
    <div className="space-y-4">
      <StatusBanner tone={myTurn ? "turn" : "neutral"}>
        {pub.phase !== "play"
          ? "Round over"
          : myTurn
            ? pub.pile
              ? `Your turn — beat it with ${need} card${need! > 1 ? "s" : ""} or pass`
              : "Your lead — play any set"
            : `${names[pub.turn]}'s turn`}
      </StatusBanner>
      {pub.phase === "play" && <Countdown deadline={game.deadline} forMe={myTurn} />}
      <div className="border-border bg-surface-2/50 flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl border p-4">
        {pub.pile ? (
          <>
            <div className="flex gap-2">
              {pub.pile.cards.map((c) => (
                <PlayingCard key={c} card={c} size={handMode ? "md" : "lg"} />
              ))}
            </div>
            <p className="text-muted text-sm">played by {names[pub.pile.player]}</p>
          </>
        ) : (
          <p className="text-muted">The pile is clear — {names[pub.turn]} leads.</p>
        )}
        <p className="text-muted text-xs">Card order: 3 (low) … K, A, 2 (high)</p>
      </div>
      {pub.phase === "roundEnd" && (
        <div className="space-y-3">
          <RoundSummaries summaries={game.roundSummaries} names={names} />
          <NextRoundButton room={room} me={me} deadline={game.deadline} onNext={() => send({ type: "next" })} />
        </div>
      )}
      {handMode && priv && pub.phase === "play" && (
        <>
          <HandPicker
            hand={priv.hand}
            selected={sel}
            onToggle={myTurn ? toggle : undefined}
            disabled={!myTurn}
            label="Your hand (tap cards of one rank)"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="lg"
              disabled={!myTurn || !sel.length}
              onClick={async () => (await send({ type: "play", cards: sel })) && setSel([])}
            >
              <Hand aria-hidden /> Play {sel.length || ""}
            </Button>
            <Button size="lg" variant="secondary" disabled={!myTurn || !pub.pile} onClick={() => send({ type: "pass" })}>
              <SkipForward aria-hidden /> Pass
            </Button>
          </div>
          {myTurn && priv.options.length === 0 && pub.pile && (
            <p className="text-muted text-center text-sm">Nothing beats the pile — you&apos;ll need to pass.</p>
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

// ───────────────────────── Bluff ─────────────────────────
export function BluffView({ pub, priv, mode, room, game, me, names, send }: GameViewProps<BluffPublic, BluffPrivate>) {
  const [sel, setSel] = useState<CardId[]>([]);
  const myTurn = pub.phase === "play" && pub.turn === me.playerId;
  const handMode = mode === "hand" && !!priv;
  const canRespond =
    pub.phase === "challenge" && pub.lastPlay?.player !== me.playerId && !pub.responded.includes(me.playerId) && handMode;
  const seats = pub.players.map((id) => ({
    id,
    active: pub.phase === "play" && pub.turn === id,
    done: pub.phase === "challenge" && pub.responded.includes(id),
    detail: <span>{pub.handCounts[id]} cards</span>,
    score: pub.handCounts[id],
  }));
  return (
    <div className="space-y-4">
      <StatusBanner tone={myTurn || canRespond ? "turn" : "neutral"}>
        {pub.phase === "over"
          ? `${names[pub.winner ?? ""]} wins!`
          : pub.phase === "challenge"
            ? `${names[pub.lastPlay!.player]} played ${pub.lastPlay!.count} × ${RANK_NAMES[pub.lastPlay!.claim]}. Bluff?`
            : myTurn
              ? `Your turn — play cards as ${RANK_NAMES[pub.required]}s`
              : `${names[pub.turn]} must play ${RANK_NAMES[pub.required]}s`}
      </StatusBanner>
      <Countdown deadline={game.deadline} forMe={myTurn || canRespond} />
      <div className="flex items-center justify-center gap-6">
        <DeckPile count={pub.pileCount} label="Pile" size={handMode ? "sm" : "lg"} />
        <div className="text-center">
          <p className="text-muted text-sm">Required rank</p>
          <p className="font-display text-amber text-5xl font-extrabold">{pub.required}</p>
        </div>
      </div>
      {pub.reveal && (
        <div
          className={cn(
            "rounded-2xl border p-3 text-center",
            pub.reveal.lied ? "border-rose/60 bg-rose/10" : "border-mint/60 bg-mint/10",
          )}
          role="status"
        >
          <p className="font-semibold">
            {names[pub.reveal.caller]} called Bluff on {names[pub.reveal.player]} —{" "}
            {pub.reveal.lied ? "caught!" : "they were honest!"} {names[pub.reveal.loser]} takes the pile.
          </p>
          <div className="mt-2 flex justify-center gap-2">
            {pub.reveal.cards.map((c) => (
              <CardFace key={c} card={c} size="sm" />
            ))}
          </div>
        </div>
      )}
      {canRespond && (
        <div className="grid grid-cols-2 gap-3">
          <Button size="xl" variant="danger" onClick={() => send({ type: "call" })}>
            <Megaphone aria-hidden /> Bluff!
          </Button>
          <Button size="xl" variant="secondary" onClick={() => send({ type: "accept" })}>
            <ThumbsUp aria-hidden /> Let it go
          </Button>
        </div>
      )}
      {handMode && priv && (
        <>
          <HandPicker
            hand={priv.hand}
            selected={sel}
            onToggle={
              myTurn ? (c) => setSel((s) => (s.includes(c) ? s.filter((x) => x !== c) : s.length < 4 ? [...s, c] : s)) : undefined
            }
            disabled={!myTurn}
            label="Your hand (pick 1–4 cards)"
          />
          <Button
            size="lg"
            className="w-full"
            disabled={!myTurn || !sel.length}
            onClick={async () => (await send({ type: "play", cards: sel })) && setSel([])}
          >
            <Hand aria-hidden /> Play {sel.length || ""} as {RANK_NAMES[pub.required]}
          </Button>
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

// ───────────────────────── Sevens ─────────────────────────
export function SevensView({ pub, priv, mode, room, game, me, names, send }: GameViewProps<SevensPublic, SevensPrivate>) {
  const [sel, setSel] = useState<CardId | null>(null);
  const myTurn = pub.phase === "play" && pub.turn === me.playerId;
  const handMode = mode === "hand" && !!priv;
  return (
    <div className="space-y-4">
      <StatusBanner tone={myTurn ? "turn" : "neutral"}>
        {pub.phase !== "play" ? "Round over" : myTurn ? "Your turn" : `${names[pub.turn]}'s turn`}
      </StatusBanner>
      {pub.phase === "play" && <Countdown deadline={game.deadline} forMe={myTurn} />}
      <div className="border-border bg-surface-2/50 space-y-2 overflow-x-auto rounded-2xl border p-3">
        {SUITS.map((s) => {
          const row = pub.rows[s];
          return (
            <div key={s} className="flex items-center gap-1" aria-label={`${SUIT_NAMES[s]} row`}>
              <span className="w-16 shrink-0 text-sm font-semibold">
                {SUIT_SYMBOLS[s]} {SUIT_NAMES[s]}
              </span>
              <div className="flex gap-1">
                {RANKS.map((r, i) => {
                  const v = i + 1;
                  const on = row && v >= row.low && v <= row.high;
                  return on ? (
                    <CardFace key={r} card={cardId(r, s)} size="xs" />
                  ) : (
                    <span
                      key={r}
                      className="border-border text-muted/60 flex h-13 w-9 items-center justify-center rounded-md border border-dashed text-[0.65rem]"
                    >
                      {r}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {pub.phase === "roundEnd" && (
        <div className="space-y-3">
          <RoundSummaries summaries={game.roundSummaries} names={names} />
          <NextRoundButton room={room} me={me} deadline={game.deadline} onNext={() => send({ type: "next" })} />
        </div>
      )}
      {handMode && priv && pub.phase === "play" && (
        <>
          <HandPicker
            hand={priv.hand}
            playable={myTurn ? priv.legal : []}
            selected={sel ? [sel] : []}
            onToggle={myTurn ? (c) => setSel(c === sel ? null : c) : undefined}
            disabled={!myTurn}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="lg"
              disabled={!myTurn || !sel}
              onClick={async () => (await send({ type: "play", card: sel })) && setSel(null)}
            >
              <Hand aria-hidden /> Play
            </Button>
            <Button
              size="lg"
              variant="secondary"
              disabled={!myTurn || priv.legal.length > 0}
              onClick={() => send({ type: "pass" })}
            >
              <SkipForward aria-hidden /> Pass
            </Button>
          </div>
        </>
      )}
      <Seats
        seats={pub.players.map((id) => ({
          id,
          active: pub.phase === "play" && pub.turn === id,
          detail: <span>{pub.handCounts[id]} cards</span>,
          score: pub.scores[id],
        }))}
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

// ───────────────────────── Golf ─────────────────────────
function GolfGrid({
  grid,
  onPick,
  size,
  label,
}: {
  grid: (CardId | null)[];
  onPick?: (i: number) => void;
  size: "xs" | "sm" | "md" | "lg";
  label: string;
}) {
  return (
    <div className="grid w-fit grid-cols-3 gap-1.5" aria-label={label}>
      {grid.map((c, i) => {
        const face = c ? <CardFace card={c} size={size} /> : <CardBack size={size} />;
        return onPick ? (
          <button
            key={i}
            type="button"
            onClick={() => onPick(i)}
            aria-label={`${c ? c : "face-down card"} at position ${i + 1}`}
            className="rounded-xl transition-transform hover:-translate-y-1"
          >
            {face}
          </button>
        ) : (
          <span key={i}>{face}</span>
        );
      })}
    </div>
  );
}

export function GolfView({ pub, priv, mode, room, game, me, names, send }: GameViewProps<GolfPublic, GolfPrivate>) {
  const handMode = mode === "hand" && !!priv;
  const myTurn = pub.phase === "play" && pub.turn === me.playerId;
  const revealing = pub.phase === "reveal" && handMode && (pub.revealed[me.playerId] ?? 0) < 2;
  const holding = pub.holding;
  const heldCard = holding?.from === "deck" ? (priv?.hand[0] ?? null) : (holding?.card ?? null);
  const myGrid = pub.grids[me.playerId];
  const [mode2, setMode2] = useState<"swap" | "flip">("swap");
  const pick = (i: number) => {
    if (revealing) return send({ type: "reveal", index: i });
    if (myTurn && holding) return send(mode2 === "flip" ? { type: "discardFlip", index: i } : { type: "swap", index: i });
  };
  return (
    <div className="space-y-4">
      <StatusBanner tone={myTurn || revealing ? "turn" : "neutral"}>
        {pub.phase === "reveal"
          ? revealing
            ? "Turn up two of your cards"
            : "Waiting for everyone to turn up two cards"
          : pub.phase === "play"
            ? myTurn
              ? holding
                ? "Place the card in your grid — or discard it and turn one up"
                : "Draw from the deck or take the discard"
              : `${names[pub.turn]}'s turn${pub.closer ? " (final turns!)" : ""}`
            : `Hole ${pub.round} complete`}
      </StatusBanner>
      {(pub.phase === "play" || pub.phase === "reveal") && <Countdown deadline={game.deadline} forMe={myTurn || revealing} />}
      <div className="flex flex-wrap items-center justify-center gap-6">
        <DeckPile count={pub.deckCount} size="md" />
        <div className="flex flex-col items-center gap-1">
          {pub.discardTop ? <PlayingCard card={pub.discardTop} size="md" /> : <CardBack size="md" />}
          <span className="text-muted text-xs">Discard</span>
        </div>
        {holding && (
          <div className="flex flex-col items-center gap-1">
            {heldCard ? <PlayingCard card={heldCard} size="md" /> : <CardBack size="md" />}
            <span className="text-muted text-xs">{names[pub.turn]} is holding</span>
          </div>
        )}
      </div>
      {pub.phase === "roundEnd" && (
        <div className="space-y-3">
          <RoundSummaries summaries={game.roundSummaries} names={names} />
          <NextRoundButton room={room} me={me} deadline={game.deadline} onNext={() => send({ type: "next" })} />
        </div>
      )}
      {handMode && myGrid && (
        <div className="border-border bg-surface-2/60 flex flex-col items-center gap-3 rounded-2xl border p-4">
          <p className="text-muted text-sm font-semibold">Your grid (columns with matching ranks score 0)</p>
          <GolfGrid grid={myGrid} size="md" label="Your grid" onPick={revealing || (myTurn && holding) ? pick : undefined} />
          {myTurn && !holding && (
            <div className="grid w-full grid-cols-2 gap-2">
              <Button size="lg" variant="sky" onClick={() => send({ type: "draw", from: "deck" })}>
                Draw from deck
              </Button>
              <Button
                size="lg"
                variant="secondary"
                disabled={!pub.discardTop}
                onClick={() => send({ type: "draw", from: "discard" })}
              >
                Take discard
              </Button>
            </div>
          )}
          {myTurn && holding?.from === "deck" && (
            <div className="grid w-full grid-cols-2 gap-2" role="radiogroup" aria-label="What to do with the card">
              <Button
                variant={mode2 === "swap" ? "primary" : "secondary"}
                role="radio"
                aria-checked={mode2 === "swap"}
                onClick={() => setMode2("swap")}
              >
                Swap into grid
              </Button>
              <Button
                variant={mode2 === "flip" ? "primary" : "secondary"}
                role="radio"
                aria-checked={mode2 === "flip"}
                onClick={() => setMode2("flip")}
              >
                Discard &amp; turn one up
              </Button>
            </div>
          )}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {pub.players
          .filter((p) => !handMode || p !== me.playerId)
          .map((p) => (
            <div
              key={p}
              className={cn(
                "bg-surface-2/60 flex items-center gap-3 rounded-xl border p-3",
                pub.turn === p && pub.phase === "play" ? "border-amber" : "border-border",
              )}
            >
              <GolfGrid grid={pub.grids[p]!} size="xs" label={`${names[p]}'s grid`} />
              <div>
                <p className="font-semibold">{names[p]}</p>
                <p className="text-muted text-sm">
                  Showing {pub.visibleScores[p]} · total {pub.scores[p]}
                </p>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

// ───────────────────────── Higher or Lower ─────────────────────────
export function HigherLowerView({
  pub,
  priv,
  mode,
  room,
  game,
  me,
  names,
  send,
}: GameViewProps<HigherLowerPublic, HigherLowerPrivate>) {
  const handMode = mode === "hand" && !!priv;
  const guessing = pub.phase === "guess";
  return (
    <div className="space-y-4">
      <StatusBanner tone={guessing && handMode && !priv?.guess ? "turn" : "neutral"}>
        Card {pub.round} · {guessing ? "Higher or lower?" : "Revealed!"}
      </StatusBanner>
      {guessing && <Countdown deadline={game.deadline} forMe={handMode && !priv?.guess} />}
      <div className="flex items-center justify-center gap-6">
        {pub.last && !guessing ? (
          <>
            <PlayingCard card={pub.last.from} size={handMode ? "lg" : "xl"} />
            <span className="text-3xl" aria-hidden>
              →
            </span>
          </>
        ) : null}
        <motion.div key={pub.current} initial={{ rotateY: 90 }} animate={{ rotateY: 0 }}>
          <PlayingCard card={pub.current} size={handMode ? "lg" : "xl"} />
        </motion.div>
      </div>
      {handMode && guessing && (
        <ChoiceGrid
          options={[
            {
              key: "higher",
              label: (
                <span className="inline-flex items-center gap-2">
                  <ArrowUp aria-hidden /> Higher
                </span>
              ),
            },
            {
              key: "lower",
              label: (
                <span className="inline-flex items-center gap-2">
                  <ArrowDown aria-hidden /> Lower
                </span>
              ),
            },
          ]}
          selected={priv?.guess}
          disabled={!!priv?.guess}
          onPick={(k) => send({ type: "guess", guess: k })}
        />
      )}
      {guessing ? (
        <LockedIn players={pub.players} done={pub.lockedIn} room={room} names={names} />
      ) : (
        <RoundReveal
          scores={pub.scores}
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
        compact={handMode}
      />
    </div>
  );
}

// ───────────────────────── Twenty-One ─────────────────────────
export function TwentyOneView({ pub, mode, room, game, me, names, send }: GameViewProps<TwentyOnePublic, null>) {
  const inGame = pub.players.includes(me.playerId);
  const handMode = mode === "hand" && inGame;
  const myStatus = pub.status[me.playerId];
  const size = handMode ? "sm" : "md";
  return (
    <div className="space-y-4">
      <StatusBanner tone={handMode && myStatus === "playing" && pub.phase === "act" ? "turn" : "neutral"}>
        Round {pub.round} · {pub.phase === "act" ? "Hit or stand?" : "Dealer's turn"}
      </StatusBanner>
      {pub.phase === "act" && <Countdown deadline={game.deadline} forMe={handMode && myStatus === "playing"} />}
      <div className="border-border bg-surface-2/50 flex flex-col items-center gap-2 rounded-2xl border p-4">
        <p className="font-semibold">Dealer {pub.dealerTotal !== null && `· ${pub.dealerTotal}`}</p>
        <div className="flex gap-2">
          {pub.dealer.map((c) => (
            <PlayingCard key={c} card={c} size={size} />
          ))}
          {Array.from({ length: pub.dealerHidden }, (_, i) => (
            <CardBack key={i} size={size} label="Hidden dealer card" />
          ))}
        </div>
      </div>
      {handMode && (
        <div className="border-amber/60 rounded-2xl border-2 p-4 text-center">
          <p className="font-semibold">Your hand · {pub.totals[me.playerId]}</p>
          <div className="my-2 flex justify-center gap-2">
            {pub.hands[me.playerId]!.map((c) => (
              <PlayingCard key={c} card={c} size="lg" />
            ))}
          </div>
          {pub.phase === "act" && myStatus === "playing" ? (
            <div className="grid grid-cols-2 gap-3">
              <Button size="xl" onClick={() => send({ type: "hit" })}>
                Hit
              </Button>
              <Button size="xl" variant="secondary" onClick={() => send({ type: "stand" })}>
                Stand
              </Button>
            </div>
          ) : (
            <p className="text-muted font-bold">
              {myStatus === "bust" ? "Bust!" : myStatus === "twentyone" ? "Twenty-one!" : "Standing"}
            </p>
          )}
        </div>
      )}
      {pub.phase === "reveal" && (
        <RoundReveal
          scores={pub.scores}
          summary={game.roundSummaries.at(-1)}
          room={room}
          me={me}
          game={game}
          names={names}
          onNext={() => send({ type: "next" })}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {pub.players
          .filter((p) => !handMode || p !== me.playerId)
          .map((p) => (
            <div key={p} className="border-border bg-surface-2/60 rounded-xl border p-3">
              <p className="font-semibold">
                {names[p]} · {pub.totals[p]}{" "}
                <span className="text-muted text-sm">
                  ({pub.status[p]}
                  {pub.outcomes ? `, ${pub.outcomes[p]}` : ""})
                </span>
              </p>
              <div className="mt-1 flex gap-1">
                {pub.hands[p]!.map((c) => (
                  <CardFace key={c} card={c} size="xs" />
                ))}
              </div>
              <p className="text-muted mt-1 text-sm">Score {pub.scores[p]}</p>
            </div>
          ))}
      </div>
    </div>
  );
}
