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
const tokenColor = (pub: { players: string[] }, p: string) => TOKEN_COLORS[pub.players.indexOf(p) % TOKEN_COLORS.length]!;
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
  const color = (p: string) => tokenColor(pub, p);
  const avatar = (p: string) => players.find((x) => x.id === p)?.avatar ?? "●";
  return (
    <div className="@container w-full">
      <div
        className="grid aspect-square w-full gap-[0.25cqw] rounded-[1.2cqw] bg-[#0b3d2a] p-[0.35cqw] shadow-2xl"
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
          const vertical = side === "bottom" || side === "top";
          return (
            <div
              key={sp.i}
              style={{
                gridRow: row,
                gridColumn: col,
                background: owner ? `color-mix(in srgb, ${color(owner)} 30%, #eef6ea)` : "#eef6ea",
              }}
              className={cn(
                "relative flex overflow-hidden rounded-[0.4cqw] text-[#1d1d1d]",
                side === "bottom" && "flex-col",
                side === "top" && "flex-col-reverse",
                side === "left" && "flex-row-reverse",
                side === "right" && "flex-row",
                pub.mortgaged.includes(sp.i) && "opacity-50 grayscale",
              )}
              title={`${sp.name}${owner ? ` — ${names[owner]}` : ""}`}
            >
              {band && <div className={vertical ? "h-[24%] shrink-0" : "w-[24%] shrink-0"} style={{ background: band }} />}
              <div
                className={cn(
                  "flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center p-[0.2cqw] text-center leading-[1.05]",
                  side === "bottom" && "pb-[1.1cqw]",
                  side === "top" && "pt-[1.1cqw]",
                  side === "left" && "pl-[1.1cqw]",
                  side === "right" && "pr-[1.1cqw]",
                )}
              >
                {!compact && <span className="line-clamp-2 w-full text-[1.2cqw] font-extrabold break-words">{sp.name}</span>}
                {spaceIcon(sp) && <span className="text-[2cqw] leading-none">{spaceIcon(sp)}</span>}
                {!compact && "price" in sp && !owner && (
                  <span className="text-[1.05cqw] font-semibold text-black/60">${sp.price}</span>
                )}
              </div>
              {owner && (
                <span
                  className={cn(
                    "absolute",
                    side === "bottom" && "inset-x-0 bottom-0 h-[0.9cqw]",
                    side === "top" && "inset-x-0 top-0 h-[0.9cqw]",
                    side === "left" && "inset-y-0 left-0 w-[0.9cqw]",
                    side === "right" && "inset-y-0 right-0 w-[0.9cqw]",
                  )}
                  style={{ background: color(owner) }}
                  aria-hidden
                />
              )}
              {h > 0 && (
                <span
                  className={cn(
                    "absolute flex gap-[0.2cqw]",
                    vertical ? "inset-x-0 justify-center" : "inset-y-0 flex-col justify-center",
                    side === "bottom" && "top-[4%]",
                    side === "top" && "bottom-[4%]",
                    side === "left" && "right-[4%]",
                    side === "right" && "left-[4%]",
                  )}
                  aria-label={h === 5 ? "hotel" : `${h} houses`}
                >
                  {h === 5 ? (
                    <span className="h-[1.5cqw] w-[2.6cqw] rounded-[0.2cqw] bg-[#e23b3b] ring-1 ring-black/50" />
                  ) : (
                    Array.from({ length: h }, (_, k) => (
                      <span key={k} className="size-[1.2cqw] rounded-[0.15cqw] bg-[#1f9d55] ring-1 ring-black/50" />
                    ))
                  )}
                </span>
              )}
              {here.length > 0 && (
                <span className="absolute inset-0 flex flex-wrap items-center justify-center gap-[0.2cqw]">
                  {here.map((p) => (
                    <motion.span
                      layoutId={`token-${p}`}
                      key={p}
                      className="grid size-[3.4cqw] place-items-center rounded-full text-[2cqw] shadow-md"
                      style={{
                        background: color(p),
                        boxShadow: pub.turn === p ? "0 0 0 0.35cqw #fff, 0 0 1.2cqw #fff" : "0 0 0 0.2cqw rgba(0,0,0,.5)",
                      }}
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
          className="flex flex-col items-center justify-center gap-[1cqw] overflow-hidden p-[1.5cqw] text-white"
        >
          {center}
        </div>
      </div>
    </div>
  );
}

/** A player's properties as little title-deed cards, grouped by colour set. */
function Deeds({ pub, player, big }: { pub: TycoonPublic; player: string; big?: boolean }) {
  const owned = BOARD.filter((sp) => pub.owner[sp.i] === player);
  if (!owned.length) return <p className="text-muted text-sm">No properties yet</p>;
  const groups: Space[][] = [];
  for (const sp of owned) {
    const key = sp.kind === "street" ? sp.group : sp.kind;
    const g = groups.find((x) => (x[0]!.kind === "street" ? (x[0] as { group: string }).group : x[0]!.kind) === key);
    if (g) g.push(sp);
    else groups.push([sp]);
  }
  return (
    <div className="flex flex-wrap gap-2">
      {groups.map((g) => {
        const first = g[0]!;
        const full =
          first.kind === "street" && BOARD.filter((x) => x.kind === "street" && x.group === first.group).length === g.length;
        return (
          <div
            key={first.i}
            className={cn("flex gap-1 rounded-lg p-1", full ? "bg-amber/15 ring-amber ring-2" : "bg-black/20")}
            title={full ? "Full set" : undefined}
          >
            {g.map((sp) => {
              const h = pub.houses[sp.i] ?? 0;
              const mort = pub.mortgaged.includes(sp.i);
              const band = sp.kind === "street" ? GROUP_HEX[sp.group] : sp.kind === "railroad" ? "#2d2d2d" : "#9aa5ad";
              return (
                <div
                  key={sp.i}
                  title={`${sp.name}${mort ? " (mortgaged)" : ""}`}
                  className={cn(
                    "flex flex-col overflow-hidden rounded-md bg-[#fbf7ee] text-[#1d1d1d] shadow ring-1 ring-black/20",
                    big ? "h-16 w-12" : "h-12 w-9",
                    mort && "opacity-40",
                  )}
                >
                  <div className="grid h-[38%] place-items-center text-[0.6rem] text-white" style={{ background: band }}>
                    {sp.kind === "railroad" ? "🚉" : sp.kind === "utility" ? spaceIcon(sp) : ""}
                  </div>
                  <div className="flex flex-1 flex-wrap content-center items-center justify-center gap-[2px] px-0.5">
                    {mort ? (
                      <span className="text-[0.55rem] font-black text-[#e23b3b]">MORT</span>
                    ) : h === 5 ? (
                      <Hotel className="size-4 text-[#e23b3b]" aria-label="hotel" />
                    ) : h > 0 ? (
                      Array.from({ length: h }, (_, k) => <span key={k} className="size-2 rounded-[2px] bg-[#1f9d55]" />)
                    ) : (
                      <span className="line-clamp-2 text-center text-[0.5rem] leading-tight font-bold">{sp.name}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
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

  const turnPlayer = room.players.find((x) => x.id === pub.turn);
  const center = handMode ? (
    <>
      <p className="font-display text-sm font-black tracking-wider text-[#ffd166]">TYCOON</p>
      {pub.dice && (
        <p className="text-3xl leading-none" aria-label={`Dice ${pub.dice[0]} and ${pub.dice[1]}`}>
          {DIE[pub.dice[0]]}
          {DIE[pub.dice[1]]}
        </p>
      )}
    </>
  ) : (
    <>
      <p className="font-display text-[3.2cqw] font-black tracking-[0.2em] text-[#ffd166] drop-shadow">TYCOON</p>
      {pub.phase !== "over" && (
        <div className="flex items-center gap-[1cqw] rounded-full bg-black/30 py-[0.5cqw] pr-[2cqw] pl-[0.6cqw]">
          <span
            className="grid size-[5cqw] place-items-center rounded-full text-[3cqw]"
            style={{ background: tokenColor(pub, pub.turn) }}
          >
            {turnPlayer?.avatar ?? "●"}
          </span>
          <span className="font-display text-[2.6cqw] font-extrabold">{names[pub.turn]}&apos;s turn</span>
        </div>
      )}
      {pub.dice && (
        <p className="text-[9cqw] leading-none drop-shadow-lg" aria-label={`Dice ${pub.dice[0]} and ${pub.dice[1]}`}>
          {DIE[pub.dice[0]]}
          {DIE[pub.dice[1]]}
        </p>
      )}
      {pub.lastCard && (
        <div className="max-w-[85%] rounded-[1cqw] bg-white px-[2cqw] py-[1.2cqw] text-center text-[1.9cqw] font-bold text-[#1d1d1d] shadow-xl">
          <span className="block text-[1.4cqw] tracking-widest text-black/50 uppercase">
            {pub.lastCard.deck === "chance" ? "❓ Chance" : "🎁 Treasure Chest"}
          </span>
          {pub.lastCard.text}
        </div>
      )}
      {!pub.lastCard && <p className="max-w-[90%] text-center text-[2cqw] font-semibold">{pub.log[pub.log.length - 1]}</p>}
      {pub.pot > 0 && <p className="text-[1.8cqw] font-bold text-[#ffd166]">Free Parking pot: {money(pub.pot)}</p>}
      <p className="text-[1.4cqw] text-white/60">
        Round {Math.min(pub.round, pub.maxRounds)} of {pub.maxRounds}
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
          {!pub.bankrupt.includes(p) && (
            <div className="mt-1.5">
              <Deeds pub={pub} player={p} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  if (!handMode) {
    const ranked = [...pub.players].sort((a, b) => pub.worth[b]! - pub.worth[a]!);
    return (
      <div className="space-y-3">
        <StatusBanner tone={pub.phase === "over" ? "done" : "neutral"}>{status}</StatusBanner>
        <Countdown deadline={game.deadline} />
        <div className="grid items-start gap-4 lg:grid-cols-[auto_minmax(20rem,1fr)]">
          <div className="mx-auto w-full lg:w-[min(calc(100dvh-9rem),62vw)]">
            <Board pub={pub} names={names} players={room.players} center={center} />
          </div>
          <ul className="space-y-3" aria-label="Players">
            {pub.players.map((p) => {
              const out = pub.bankrupt.includes(p);
              const turn = pub.turn === p && pub.phase !== "over";
              const rank = ranked.indexOf(p) + 1;
              const pp = room.players.find((x) => x.id === p);
              return (
                <li
                  key={p}
                  className={cn(
                    "bg-surface-2 rounded-2xl border-2 p-3 transition-colors",
                    turn ? "border-amber shadow-[0_0_24px_rgba(255,193,69,0.35)]" : "border-border",
                    pub.winner === p && "border-mint bg-mint/10",
                    out && "opacity-45",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="grid size-12 shrink-0 place-items-center rounded-full text-2xl ring-4 ring-black/30"
                      style={{ background: tokenColor(pub, p) }}
                    >
                      {pp?.avatar ?? "●"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-display truncate text-xl font-extrabold">{names[p]}</span>
                        {turn && (
                          <span className="bg-amber rounded-full px-2 py-0.5 text-xs font-black text-[#2a1c00]">TURN</span>
                        )}
                        {pub.inJail.includes(p) && (
                          <span className="bg-rose/20 text-rose inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold">
                            <Lock className="size-3" aria-hidden /> JAIL
                          </span>
                        )}
                        {pub.jailCards[p]! > 0 && <span title="Get Out of Jail Free">🗝️</span>}
                        {out && <span className="text-rose text-xs font-black">BANKRUPT</span>}
                      </p>
                      <p className="text-muted truncate text-sm">
                        #{rank} · worth {money(pub.worth[p]!)} · {out ? "out" : BOARD[pub.pos[p]!]!.name}
                      </p>
                    </div>
                    <span className="font-display text-3xl font-black text-[#51e0a0] tabular-nums">{money(pub.cash[p]!)}</span>
                  </div>
                  {!out && (
                    <div className="mt-2">
                      <Deeds pub={pub} player={p} big={pub.players.length <= 4} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
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
