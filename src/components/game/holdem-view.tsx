"use client";
import { useState } from "react";
import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { type HoldemPrivate, type HoldemPublic, STREETS } from "@/games/texas-holdem";
import { cn } from "@/lib/utils";
import { Countdown, EventLog, StatusBanner } from "./common";
import { NextRoundButton } from "./next-round";
import { CardBack, PlayingCard } from "./playing-card";
import type { GameViewProps } from "./types";

function Chips({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 font-mono font-bold tabular-nums", className)}>
      <Coins className="text-amber size-4" aria-hidden />
      {n.toLocaleString()}
    </span>
  );
}

export function HoldemView({ pub, priv, mode, room, game, me, names, send }: GameViewProps<HoldemPublic, HoldemPrivate>) {
  const meId = me.playerId;
  const handMode = mode === "hand" && !!priv;
  const myTurn = pub.phase === "betting" && pub.toAct === meId;
  const toCall = Math.max(0, pub.currentBet - (pub.bets[meId] ?? 0));
  const stack = pub.stacks[meId] ?? 0;
  const maxTo = (pub.bets[meId] ?? 0) + stack;
  const minTo = Math.min(maxTo, pub.currentBet + pub.minRaise);
  // The chosen raise resets whenever the betting situation changes.
  const spot = `${pub.hand}-${pub.street}-${pub.currentBet}-${pub.toAct}`;
  const [pick, setPick] = useState<{ spot: string; to: number } | null>(null);
  const raiseTo = pick && pick.spot === spot ? pick.to : minTo;
  const setRaiseTo = (to: number) => setPick({ spot, to });

  const status =
    pub.phase === "over"
      ? "Game over — biggest stack wins"
      : pub.phase === "showdown"
        ? (pub.result?.lines[0] ?? "Hand over")
        : myTurn
          ? toCall
            ? `Your move — ${toCall} to call`
            : "Your move — check or bet"
          : `${names[pub.toAct ?? ""] ?? "…"} is thinking…`;

  const board = (
    <div className="flex flex-col items-center gap-2 rounded-[3rem] border-8 border-[#5b3a1d] bg-[radial-gradient(ellipse_at_center,#1f7a4a_0%,#125234_70%)] px-4 py-5 shadow-inner">
      <p className="text-sm font-bold tracking-widest text-white/70 uppercase">
        Hand {pub.hand}/{pub.maxHands} · {STREETS[pub.street]} · blinds {pub.blinds.sb}/{pub.blinds.bb}
      </p>
      <div className={cn("flex flex-wrap justify-center", handMode ? "min-h-17 gap-1.5" : "min-h-24 gap-2")}>
        {pub.board.map((c) => (
          <PlayingCard key={c} card={c} size={handMode ? "sm" : "lg"} />
        ))}
        {Array.from({ length: 5 - pub.board.length }, (_, i) => (
          <span
            key={i}
            className={cn("rounded-xl border-2 border-dashed border-white/25", handMode ? "h-17 w-12" : "h-31 w-22")}
          />
        ))}
      </div>
      <p className="font-display text-2xl font-black text-white">
        Pot <Chips n={pub.pot} className="text-2xl" />
      </p>
      {pub.lastAction && pub.phase === "betting" && <p className="font-semibold text-white/90">{pub.lastAction.text}</p>}
    </div>
  );

  const seats = (
    <ul className={cn("grid gap-2", handMode ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-3")} aria-label="Players">
      {pub.players.map((p) => {
        const out = pub.stacks[p] === 0 && !pub.inHand.includes(p);
        const folded = pub.folded.includes(p);
        const shown = pub.shown[p];
        const won = pub.result?.winners.find((w) => w.player === p);
        return (
          <li
            key={p}
            className={cn(
              "bg-surface-2 rounded-xl border p-2",
              pub.toAct === p ? "border-amber shadow-[0_0_0_2px_rgba(255,193,69,0.35)]" : "border-border",
              won && "border-mint bg-mint/10",
              (folded || out) && "opacity-50",
            )}
          >
            <p className="flex items-center gap-1.5 font-semibold">
              <span className="truncate">{names[p]}</span>
              {p === pub.dealer && (
                <span
                  className="bg-text text-bg grid size-5 place-items-center rounded-full text-[0.6rem] font-black"
                  title="Dealer button"
                >
                  D
                </span>
              )}
              {p === meId && <span className="text-muted text-xs">(you)</span>}
              <Chips n={pub.stacks[p]!} className="ml-auto text-sm" />
            </p>
            <div className="mt-1 flex items-center gap-2 text-xs">
              {shown ? (
                <span className="flex gap-1">
                  {shown.map((c) => (
                    <PlayingCard key={c} card={c} size="xs" />
                  ))}
                </span>
              ) : pub.inHand.includes(p) && !folded ? (
                <span className="flex gap-0.5">
                  <CardBack size="xs" />
                  <CardBack size="xs" />
                </span>
              ) : null}
              <span className="text-muted">
                {out ? "Busted" : folded ? "Folded" : pub.allIn.includes(p) ? "ALL IN" : pub.bets[p] ? `Bet ${pub.bets[p]}` : ""}
                {won && (
                  <strong className="text-mint">
                    {" "}
                    +{won.amount}
                    {won.hand ? ` · ${won.hand}` : ""}
                  </strong>
                )}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );

  const raise = (to: number) => send({ type: "raise", to });

  return (
    <div className="space-y-4">
      <StatusBanner tone={myTurn ? "turn" : pub.phase === "betting" ? "wait" : "done"}>{status}</StatusBanner>
      {pub.phase === "betting" && <Countdown deadline={game.deadline} forMe={myTurn} />}
      {board}
      {pub.result && pub.phase !== "betting" && pub.result.lines.length > 1 && (
        <ul className="text-muted text-center text-sm">
          {pub.result.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      {pub.phase === "showdown" && (
        <NextRoundButton room={room} me={me} deadline={game.deadline} onNext={() => send({ type: "next" })} label="Next hand" />
      )}

      {handMode && priv && (
        <section aria-label="Your hand" className="border-border bg-surface-2/70 space-y-3 rounded-2xl border p-3">
          <div className="flex items-center justify-center gap-3">
            {priv.hand.map((c) => (
              <PlayingCard key={c} card={c} size="xl" />
            ))}
            <div className="space-y-1">
              <Chips n={stack} className="text-xl" />
              {priv.best && <p className="text-mint font-bold">{priv.best}</p>}
            </div>
          </div>
          {myTurn && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Button size="lg" variant="danger" onClick={() => send({ type: "fold" })}>
                  Fold
                </Button>
                {toCall ? (
                  <Button size="lg" variant="mint" onClick={() => send({ type: "call" })}>
                    {toCall >= stack ? `Call all-in (${stack})` : `Call ${toCall}`}
                  </Button>
                ) : (
                  <Button size="lg" variant="mint" onClick={() => send({ type: "check" })}>
                    Check
                  </Button>
                )}
              </div>
              {maxTo > pub.currentBet && (
                <div className="border-border space-y-2 rounded-xl border p-3">
                  <div className="flex flex-wrap gap-2">
                    {[
                      ["Min", minTo],
                      ["½ pot", pub.currentBet + Math.round(pub.pot / 2)],
                      ["Pot", pub.currentBet + pub.pot],
                    ].map(([label, v]) => {
                      const val = Math.min(maxTo, Math.max(minTo, v as number));
                      return (
                        <Button key={label} size="sm" variant="secondary" onClick={() => setRaiseTo(val)}>
                          {label}
                        </Button>
                      );
                    })}
                    <Button size="sm" variant="secondary" onClick={() => setRaiseTo(maxTo)}>
                      All-in
                    </Button>
                  </div>
                  {minTo < maxTo && (
                    <Slider
                      min={minTo}
                      max={maxTo}
                      step={Math.min(10, maxTo - minTo)}
                      value={[raiseTo]}
                      onValueChange={([v]) => setRaiseTo(v!)}
                      thumbLabel="Raise amount"
                    />
                  )}
                  <Button size="lg" className="w-full" onClick={() => raise(raiseTo)}>
                    {raiseTo >= maxTo ? `ALL IN (${maxTo}) 🔥` : `${pub.currentBet ? "Raise" : "Bet"} to ${raiseTo}`}
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>
      )}
      {seats}
      <EventLog entries={pub.log} />
    </div>
  );
}
