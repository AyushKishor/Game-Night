"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Dice5, Handshake, Home, Hotel, Landmark, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BOARD,
  GROUP_HEX,
  type Space,
  type TycoonPublic,
  type TycoonState,
  buildError,
  mortgageError,
  mortgageValue,
  sellError,
  unmortgageCost,
} from "@/games/tycoon";
import type { PublicPlayer } from "@/lib/shared/protocol";
import { cn } from "@/lib/utils";
import { Countdown, EventLog, StatusBanner } from "./common";
import type { GameViewProps } from "./types";

const TOKEN_COLORS = ["#ff6b6b", "#4cc9f0", "#51e0a0", "#ffc145", "#b28dff", "#ff8fab"];
const DIE = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

/** Grid row/column (1-based) for a board index on an 11×11 grid. */
function cellPos(i: number): { row: number; col: number } {
  if (i <= 10) return { row: 11, col: 11 - i };
  if (i <= 20) return { row: 11 - (i - 10), col: 1 };
  if (i <= 30) return { row: 1, col: 1 + (i - 20) };
  return { row: 1 + (i - 30), col: 11 };
}

const asState = (pub: TycoonPublic) => pub as unknown as TycoonState;
const money = (n: number) => `$${n.toLocaleString()}`;

function spaceIcon(sp: Space) {
  switch (sp.kind) {
    case "go":
      return "➡️";
    case "jail":
      return "🚔";
    case "parking":
      return "🅿️";
    case "goToJail":
      return "👮";
    case "chance":
      return "❓";
    case "chest":
      return "🎁";
    case "tax":
      return "💸";
    case "railroad":
      return "🚉";
    case "utility":
      return sp.name.startsWith("Power") ? "💡" : "🚰";
    default:
      return "";
  }
}

function Board({
  pub,
  names,
  players,
  compact,
  center,
}: {
  pub: TycoonPublic;
  names: Record<string, string>;
  players: PublicPlayer[];
  compact?: boolean;
  center: React.ReactNode;
}) {
  const color = (p: string) => TOKEN_COLORS[pub.players.indexOf(p) % TOKEN_COLORS.length]!;
  const avatar = (p: string) => players.find((x) => x.id === p)?.avatar ?? "●";
  return (
    <div
      className="grid aspect-square w-full gap-[2px] rounded-xl bg-[#0b3d2a] p-[2px]"
      style={{ gridTemplateColumns: "1.6fr repeat(9, 1fr) 1.6fr", gridTemplateRows: "1.6fr repeat(9, 1fr) 1.6fr" }}
      role="img"
      aria-label="Game board"
    >
      {BOARD.map((sp) => {
        const { row, col } = cellPos(sp.i);
        const owner = pub.owner[sp.i];
        const h = pub.houses[sp.i] ?? 0;
        const here = pub.players.filter((p) => pub.pos[p] === sp.i && !pub.bankrupt.includes(p));
        const side = sp.i < 10 ? "bottom" : sp.i < 20 ? "left" : sp.i < 30 ? "top" : "right";
        const band = sp.kind === "street" ? GROUP_HEX[sp.group] : null;
        return (
          <div
            key={sp.i}
            style={{ gridRow: row, gridColumn: col }}
            className={cn(
              "relative flex overflow-hidden rounded-[3px] bg-[#e9f3e4] text-[#1d1d1d]",
              side === "bottom" && "flex-col",
              side === "top" && "flex-col-reverse",
              side === "left" && "flex-row-reverse",
              side === "right" && "flex-row",
              pub.mortgaged.includes(sp.i) && "opacity-55",
            )}
            title={sp.name}
          >
            {band && (
              <div
                className={side === "bottom" || side === "top" ? "h-[22%] shrink-0" : "w-[22%] shrink-0"}
                style={{ background: band }}
              />
            )}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center p-[1px] text-center leading-[1.05]">
              {!compact && <span className="line-clamp-2 text-[clamp(0.35rem,0.75vw,0.7rem)] font-bold">{sp.name}</span>}
              {spaceIcon(sp) && (
                <span className={compact ? "text-[0.6rem]" : "text-[clamp(0.5rem,1vw,1rem)]"}>{spaceIcon(sp)}</span>
              )}
              {!compact && "price" in sp && !owner && (
                <span className="text-[clamp(0.3rem,0.6vw,0.6rem)] text-black/60">${sp.price}</span>
              )}
            </div>
            {owner && (
              <span
                className="absolute top-0.5 right-0.5 size-[22%] max-h-3 max-w-3 rounded-full ring-1 ring-black/40"
                style={{ background: color(owner) }}
                title={`Owned by ${names[owner]}`}
              />
            )}
            {h > 0 && (
              <span className="absolute bottom-0 left-0 flex gap-[1px] p-[1px]">
                {h === 5 ? (
                  <span className="h-2 w-3 rounded-[2px] bg-[#e23b3b] ring-1 ring-black/40" />
                ) : (
                  Array.from({ length: h }, (_, k) => (
                    <span key={k} className="size-1.5 rounded-[1px] bg-[#1f9d55] ring-1 ring-black/40" />
                  ))
                )}
              </span>
            )}
            {here.length > 0 && (
              <span className="absolute inset-0 flex flex-wrap items-center justify-center gap-[1px]">
                {here.map((p) => (
                  <motion.span
                    layoutId={`token-${p}`}
                    key={p}
                    className={cn(
                      "grid place-items-center rounded-full ring-2",
                      compact ? "size-3.5 text-[0.5rem]" : "size-[clamp(0.9rem,2vw,1.8rem)] text-[clamp(0.55rem,1.2vw,1.1rem)]",
                    )}
                    style={{ background: color(p), boxShadow: `0 0 0 2px ${pub.turn === p ? "#fff" : "transparent"}` }}
                    title={names[p]}
                  >
                    {avatar(p)}
                  </motion.span>
                ))}
              </span>
            )}
          </div>
        );
      })}
      <div
        style={{ gridRow: "2 / 11", gridColumn: "2 / 11" }}
        className="flex flex-col items-center justify-center gap-2 overflow-hidden p-2 text-white"
      >
        {center}
      </div>
    </div>
  );
}

function PropertyManager({
  pub,
  me,
  canManage,
  debtor,
  send,
}: {
  pub: TycoonPublic;
  me: string;
  canManage: boolean;
  debtor: boolean;
  send: (a: object) => Promise<boolean>;
}) {
  const s = asState(pub);
  const mine = BOARD.filter((sp) => pub.owner[sp.i] === me);
  if (!mine.length) return <p className="text-muted text-sm">You don&apos;t own anything yet.</p>;
  return (
    <ul className="space-y-1.5">
      {mine.map((sp) => {
        const h = pub.houses[sp.i] ?? 0;
        const mort = pub.mortgaged.includes(sp.i);
        const canBuild = canManage && !debtor && !buildError(s, me, sp.i);
        const canSell = (canManage || debtor) && !sellError(s, me, sp.i);
        const canMortgage = (canManage || debtor) && !mortgageError(s, me, sp.i);
        const canUnmortgage = canManage && !debtor && mort && pub.cash[me]! >= unmortgageCost(sp.i);
        return (
          <li key={sp.i} className="bg-surface-2 flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5">
            <span
              className="size-3.5 shrink-0 rounded-sm ring-1 ring-black/30"
              style={{ background: sp.kind === "street" ? GROUP_HEX[sp.group] : "#888" }}
            />
            <span className="flex-1 font-semibold">
              {sp.name}
              {mort && <span className="text-rose text-xs"> · mortgaged</span>}
              {h > 0 && (
                <span className="text-mint ml-1 inline-flex items-center gap-0.5 text-xs">
                  {h === 5 ? (
                    <Hotel className="size-3.5" aria-label="hotel" />
                  ) : (
                    <>
                      <Home className="size-3.5" aria-hidden /> ×{h}
                    </>
                  )}
                </span>
              )}
            </span>
            {sp.kind === "street" && canBuild && (
              <Button size="sm" variant="mint" onClick={() => send({ type: "build", space: sp.i })}>
                Build ${sp.house}
              </Button>
            )}
            {canSell && (
              <Button size="sm" variant="secondary" onClick={() => send({ type: "sell", space: sp.i })}>
                Sell +${"house" in sp ? sp.house / 2 : 0}
              </Button>
            )}
            {canMortgage && (
              <Button size="sm" variant="outline" onClick={() => send({ type: "mortgage", space: sp.i })}>
                Mortgage +${mortgageValue(sp.i)}
              </Button>
            )}
            {canUnmortgage && (
              <Button size="sm" variant="outline" onClick={() => send({ type: "unmortgage", space: sp.i })}>
                Unmortgage ${unmortgageCost(sp.i)}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function TradeComposer({
  pub,
  me,
  names,
  send,
}: {
  pub: TycoonPublic;
  me: string;
  names: Record<string, string>;
  send: (a: object) => Promise<boolean>;
}) {
  const others = pub.players.filter((p) => p !== me && !pub.bankrupt.includes(p));
  const [to, setTo] = useState<string | null>(others[0] ?? null);
  const [give, setGive] = useState<number[]>([]);
  const [get, setGet] = useState<number[]>([]);
  const [giveCash, setGiveCash] = useState(0);
  const [getCash, setGetCash] = useState(0);
  const tradable = (owner: string) =>
    BOARD.filter(
      (sp) =>
        pub.owner[sp.i] === owner &&
        !(sp.kind === "street" && BOARD.some((x) => x.kind === "street" && x.group === sp.group && (pub.houses[x.i] ?? 0) > 0)),
    );
  const toggle = (list: number[], set: (v: number[]) => void, i: number) =>
    set(list.includes(i) ? list.filter((x) => x !== i) : [...list, i]);
  const chip = (sp: Space, on: boolean, onClick: () => void) => (
    <button
      key={sp.i}
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "flex items-center gap-1 rounded-full border px-2 py-1 text-xs",
        on ? "border-amber bg-amber/20" : "border-border",
      )}
    >
      <span className="size-2.5 rounded-full" style={{ background: sp.kind === "street" ? GROUP_HEX[sp.group] : "#888" }} />
      {sp.name}
    </button>
  );
  if (!to) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {others.map((p) => (
          <Button key={p} size="sm" variant={p === to ? "primary" : "secondary"} onClick={() => (setTo(p), setGet([]))}>
            {names[p]}
          </Button>
        ))}
      </div>
      <p className="text-sm font-semibold">You give</p>
      <div className="flex flex-wrap gap-1">
        {tradable(me).map((sp) => chip(sp, give.includes(sp.i), () => toggle(give, setGive, sp.i)))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        + cash $
        <Input
          type="number"
          min={0}
          max={pub.cash[me]}
          value={giveCash}
          onChange={(e) => setGiveCash(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          className="h-9 w-28"
        />
      </label>
      <p className="text-sm font-semibold">You get from {names[to]}</p>
      <div className="flex flex-wrap gap-1">
        {tradable(to).map((sp) => chip(sp, get.includes(sp.i), () => toggle(get, setGet, sp.i)))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        + cash $
        <Input
          type="number"
          min={0}
          max={pub.cash[to]}
          value={getCash}
          onChange={(e) => setGetCash(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          className="h-9 w-28"
        />
      </label>
      <Button
        onClick={async () => {
          if (
            await send({ type: "trade-offer", to, give: { spaces: give, cash: giveCash }, get: { spaces: get, cash: getCash } })
          ) {
            setGive([]);
            setGet([]);
            setGiveCash(0);
            setGetCash(0);
          }
        }}
      >
        <Handshake aria-hidden /> Send offer
      </Button>
    </div>
  );
}

function describeSide(side: { spaces: number[]; cash: number }) {
  const parts = side.spaces.map((i) => BOARD[i]!.name);
  if (side.cash) parts.push(money(side.cash));
  return parts.join(", ") || "nothing";
}

export function TycoonView({ pub, mode, room, game, me, names, send }: GameViewProps<TycoonPublic, { me: string }>) {
  const [bid, setBid] = useState<number | "">("");
  const [showTrade, setShowTrade] = useState(false);
  const meId = me.playerId;
  const inGame = pub.players.includes(meId);
  const handMode = mode === "hand" && inGame;
  const waiting = game.pending.includes(meId);
  const myTurn = pub.turn === meId && pub.phase !== "over";
  const debt = pub.debts[0];
  const iOwe = debt?.from === meId;
  const blocked = !!debt || !!pub.trade || pub.phase === "auction";
  const canManage = myTurn && !blocked && ["roll", "buy", "end"].includes(pub.phase);
  const here = BOARD[pub.pos[pub.turn] ?? 0]!;

  const status =
    pub.phase === "over"
      ? `🏆 ${names[pub.winner!]} wins!`
      : debt
        ? iOwe
          ? `You owe ${money(debt.amount)} — raise the cash!`
          : `${names[debt.from]} is scrambling to pay ${money(debt.amount)}…`
        : pub.trade
          ? pub.trade.to === meId
            ? `${names[pub.trade.from]} wants to trade!`
            : `${names[pub.trade.to]} is considering a trade…`
          : pub.phase === "auction"
            ? `Auction: ${BOARD[pub.auction!.space]!.name}`
            : myTurn
              ? pub.phase === "roll"
                ? pub.inJail.includes(meId)
                  ? "You're in Jail — pay, use a card, or roll for doubles"
                  : "Your turn — roll!"
                : pub.phase === "buy"
                  ? `Buy ${here.name}?`
                  : "Build, trade or end your turn"
              : `${names[pub.turn]}'s turn`;

  const center = (
    <>
      <p
        className={cn(
          "font-display font-black tracking-wider text-[#ffd166]",
          handMode ? "text-sm" : "text-[clamp(1rem,2.4vw,2.2rem)]",
        )}
      >
        TYCOON
      </p>
      {pub.dice && (
        <p
          className={cn("leading-none", handMode ? "text-3xl" : "text-[clamp(2rem,5vw,4.5rem)]")}
          aria-label={`Dice ${pub.dice[0]} and ${pub.dice[1]}`}
        >
          {DIE[pub.dice[0]]}
          {DIE[pub.dice[1]]}
        </p>
      )}
      {pub.lastCard && !handMode && (
        <div className="max-w-[80%] rounded-lg bg-white/95 px-3 py-2 text-center text-[clamp(0.6rem,1.1vw,1rem)] font-semibold text-[#1d1d1d] shadow">
          {pub.lastCard.deck === "chance" ? "❓ Chance" : "🎁 Treasure Chest"}: {pub.lastCard.text}
        </div>
      )}
      {!handMode && <p className="text-center text-[clamp(0.6rem,1.2vw,1.1rem)] font-semibold">{pub.log[pub.log.length - 1]}</p>}
      {pub.pot > 0 && <p className="text-xs font-bold">Free Parking pot: {money(pub.pot)}</p>}
      <p className="text-[0.65rem] text-white/60">
        Round {Math.min(pub.round, pub.maxRounds)}/{pub.maxRounds}
      </p>
    </>
  );

  const playerList = (
    <ul className={cn("grid gap-2", handMode ? "grid-cols-2" : "grid-cols-2 xl:grid-cols-3")} aria-label="Players">
      {pub.players.map((p, idx) => (
        <li
          key={p}
          className={cn(
            "bg-surface-2 rounded-xl border p-2 text-sm",
            pub.turn === p && pub.phase !== "over" ? "border-amber" : "border-border",
            pub.bankrupt.includes(p) && "opacity-45",
          )}
        >
          <p className="flex items-center gap-1.5 font-semibold">
            <span className="size-3 rounded-full" style={{ background: TOKEN_COLORS[idx % TOKEN_COLORS.length] }} />
            <span className="truncate">{names[p]}</span>
            {pub.inJail.includes(p) && <Lock className="text-rose size-3.5" aria-label="in jail" />}
            <span className="ml-auto font-mono">{money(pub.cash[p]!)}</span>
          </p>
          <p className="text-muted text-xs">
            {pub.bankrupt.includes(p) ? "Bankrupt" : `${BOARD[pub.pos[p]!]!.name} · worth ${money(pub.worth[p]!)}`}
            {pub.jailCards[p]! > 0 && " · 🗝️"}
          </p>
        </li>
      ))}
    </ul>
  );

  if (!handMode) {
    return (
      <div className="space-y-3">
        <StatusBanner tone={pub.phase === "over" ? "done" : "neutral"}>{status}</StatusBanner>
        <Countdown deadline={game.deadline} />
        <div className="mx-auto max-w-[min(100%,78vh)]">
          <Board pub={pub} names={names} players={room.players} center={center} />
        </div>
        {playerList}
      </div>
    );
  }

  const auction = pub.auction;
  const auctionSpace = auction ? (BOARD[auction.space] as Extract<Space, { price: number }>) : null;

  return (
    <div className="space-y-4">
      <StatusBanner tone={pub.phase === "over" ? "done" : waiting ? "turn" : "wait"}>{status}</StatusBanner>
      <Countdown deadline={game.deadline} forMe={waiting} />
      <div className="flex items-center justify-center gap-4">
        {pub.dice && (
          <span className="text-5xl leading-none">
            {DIE[pub.dice[0]]}
            {DIE[pub.dice[1]]}
          </span>
        )}
        <div className="text-sm">
          <p className="font-display text-2xl font-black">{money(pub.cash[meId] ?? 0)}</p>
          <p className="text-muted">You&apos;re on {BOARD[pub.pos[meId] ?? 0]!.name}</p>
        </div>
      </div>
      {pub.lastCard && (
        <p className="rounded-xl bg-white/95 px-3 py-2 text-center font-semibold text-[#1d1d1d]">
          {pub.lastCard.deck === "chance" ? "❓" : "🎁"} {pub.lastCard.text}
        </p>
      )}

      {iOwe && debt && (
        <div className="border-rose/60 bg-rose/10 space-y-2 rounded-2xl border-2 p-3">
          <p className="font-display text-lg font-bold">
            You owe {money(debt.amount)} {debt.to ? `to ${names[debt.to]}` : "to the bank"} ({debt.reason}).
          </p>
          <p className="text-muted text-sm">Sell buildings or mortgage properties below until you have enough.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" disabled={(pub.cash[meId] ?? 0) < debt.amount} onClick={() => send({ type: "pay-debt" })}>
              Pay {money(debt.amount)}
            </Button>
            {(pub.cash[meId] ?? 0) < debt.amount && (
              <Button size="lg" variant="danger" onClick={() => send({ type: "bankrupt" })}>
                Declare bankruptcy
              </Button>
            )}
          </div>
        </div>
      )}

      {pub.trade && (pub.trade.to === meId || pub.trade.from === meId) && (
        <div className="border-sky/60 bg-sky/10 space-y-2 rounded-2xl border p-3">
          <p className="font-semibold">
            {pub.trade.from === meId ? "Your offer to " + names[pub.trade.to] : `${names[pub.trade.from]} offers you`}:
          </p>
          <p>
            <strong>{describeSide(pub.trade.to === meId ? pub.trade.give : pub.trade.get)}</strong> for{" "}
            <strong>{describeSide(pub.trade.to === meId ? pub.trade.get : pub.trade.give)}</strong>
          </p>
          <div className="flex gap-2">
            {pub.trade.to === meId && (
              <Button size="lg" variant="mint" onClick={() => send({ type: "trade-accept" })}>
                Accept
              </Button>
            )}
            <Button size="lg" variant="secondary" onClick={() => send({ type: "trade-decline" })}>
              {pub.trade.to === meId ? "Decline" : "Withdraw"}
            </Button>
          </div>
        </div>
      )}

      {auction && auctionSpace && (
        <div className="border-amber/60 bg-amber/10 space-y-2 rounded-2xl border p-3">
          <p className="font-display text-lg font-bold">
            🔨 Sealed-bid auction: {auctionSpace.name} (list price {money(auctionSpace.price)})
          </p>
          {waiting ? (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await send({ type: "bid", amount: Number(bid) || 0 })) setBid("");
              }}
            >
              <Input
                type="number"
                min={0}
                max={pub.cash[meId]}
                value={bid}
                onChange={(e) => setBid(e.target.value === "" ? "" : Math.max(0, Math.floor(Number(e.target.value))))}
                placeholder="Your bid"
                className="w-32"
                aria-label="Your bid"
              />
              <Button type="submit">Bid</Button>
              <Button type="button" variant="ghost" onClick={() => send({ type: "bid", amount: 0 })}>
                Pass
              </Button>
            </form>
          ) : (
            <p className="text-muted">Bid locked in — waiting for everyone else.</p>
          )}
        </div>
      )}

      {myTurn && !blocked && (
        <div className="flex flex-wrap gap-2">
          {pub.phase === "roll" && (
            <>
              <Button size="xl" onClick={() => send({ type: "roll" })}>
                <Dice5 aria-hidden /> Roll
              </Button>
              {pub.inJail.includes(meId) && (
                <>
                  <Button
                    size="lg"
                    variant="secondary"
                    disabled={(pub.cash[meId] ?? 0) < 50}
                    onClick={() => send({ type: "pay-jail" })}
                  >
                    Pay $50
                  </Button>
                  {pub.jailCards[meId]! > 0 && (
                    <Button size="lg" variant="secondary" onClick={() => send({ type: "use-jail-card" })}>
                      🗝️ Use card
                    </Button>
                  )}
                </>
              )}
            </>
          )}
          {pub.phase === "buy" && "price" in here && (
            <>
              <Button
                size="xl"
                variant="mint"
                disabled={(pub.cash[meId] ?? 0) < here.price}
                onClick={() => send({ type: "buy" })}
              >
                <Landmark aria-hidden /> Buy for {money(here.price)}
              </Button>
              <Button size="lg" variant="secondary" onClick={() => send({ type: "decline" })}>
                Pass (auction)
              </Button>
            </>
          )}
          {pub.phase === "end" && (
            <Button size="xl" onClick={() => send({ type: "end" })}>
              End turn
            </Button>
          )}
          {(pub.phase === "roll" || pub.phase === "end") && (
            <Button size="lg" variant="outline" onClick={() => setShowTrade((v) => !v)} aria-expanded={showTrade}>
              <Handshake aria-hidden /> Trade
            </Button>
          )}
        </div>
      )}
      {showTrade && canManage && (pub.phase === "roll" || pub.phase === "end") && (
        <div className="border-border rounded-2xl border p-3">
          <TradeComposer
            pub={pub}
            me={meId}
            names={names}
            send={async (a) => {
              const ok = await send(a);
              if (ok) setShowTrade(false);
              return ok;
            }}
          />
        </div>
      )}

      <section aria-label="Your properties" className="border-border bg-surface/60 rounded-2xl border p-3">
        <h3 className="font-display mb-2 text-lg font-bold">Your properties</h3>
        <PropertyManager pub={pub} me={meId} canManage={canManage} debtor={iOwe} send={send} />
      </section>

      <Board pub={pub} names={names} players={room.players} compact center={center} />
      {playerList}
      <EventLog entries={pub.log} />
    </div>
  );
}
