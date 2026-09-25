"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Building2, Hotel, Home, Landmark, Layers, ShieldBan, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  COLOR_INFO,
  type Color,
  type DealRequest,
  NO_BUILDINGS,
  type Pile,
  type PropertyDealPrivate,
  type PropertyDealPublic,
  card,
  colorsOf,
  completeColors,
  isAction,
  isComplete,
  money,
  payableCards,
  pileOf,
  rentOf,
  stealable,
  suggestPayment,
  valueOf,
} from "@/games/property-deal";
import { cn } from "@/lib/utils";
import { Countdown, EventLog, StatusBanner } from "./common";
import type { GameViewProps } from "./types";

type Send = (action: object) => Promise<boolean>;

const DARK_TEXT: Color[] = ["lightBlue", "yellow", "utility", "orange"];
const textOn = (c: Color) => (DARK_TEXT.includes(c) ? "text-[#1d1d1d]" : "text-white");
const rainbow = "linear-gradient(90deg,#e23b3b,#f58b1f,#f5d31b,#1f9d55,#8fd3f4,#2446b8,#e0529c)";

function bandStyle(colors: Color[]): React.CSSProperties {
  if (colors.length > 2) return { background: rainbow };
  if (colors.length === 2)
    return { background: `linear-gradient(90deg,${COLOR_INFO[colors[0]!].hex} 50%,${COLOR_INFO[colors[1]!].hex} 50%)` };
  return { background: COLOR_INFO[colors[0]!].hex };
}

// ───────────────────────── Cards ─────────────────────────

const SIZES = {
  sm: "w-[4.5rem] h-[6.4rem] text-[0.62rem]",
  md: "w-[6.2rem] h-[8.8rem] text-[0.72rem]",
  lg: "w-[7.5rem] h-[10.6rem] text-sm",
};

export function DealCard({
  id,
  size = "md",
  selected,
  dim,
  onClick,
  color,
}: {
  id: string;
  size?: keyof typeof SIZES;
  selected?: boolean;
  dim?: boolean;
  onClick?: () => void;
  /** For wildcards on the table: the colour they're currently used as. */
  color?: Color;
}) {
  const c = card(id);
  const base = cn(
    "relative flex shrink-0 flex-col overflow-hidden rounded-xl bg-[#fbf7ee] text-[#1d1d1d] shadow-card ring-1 ring-black/15 select-none text-left leading-tight",
    SIZES[size],
    selected && "ring-amber -translate-y-2 ring-4",
    dim && "opacity-45",
    onClick && "cursor-pointer transition-transform hover:-translate-y-1",
  );
  const valueBadge = c.value > 0 && (
    <span className="absolute top-1 left-1 grid size-[1.9em] place-items-center rounded-full border border-black/30 bg-white text-[0.95em] font-extrabold text-[#1d1d1d]">
      {c.value}
    </span>
  );
  let body: React.ReactNode;
  if (c.kind === "money") {
    body = (
      <div className="flex h-full flex-col items-center justify-center bg-[#d9ecd0] p-1">
        {valueBadge}
        <span className="font-display text-[2.4em] font-black text-[#1f5c2e]">{c.value}M</span>
        <span className="text-[0.9em] font-bold tracking-widest text-[#1f5c2e]/70 uppercase">money</span>
      </div>
    );
  } else if (c.kind === "property" || c.kind === "wild") {
    const colors = c.kind === "property" ? [c.color] : c.colors;
    const using = color ?? (colors.length === 1 ? colors[0] : undefined);
    body = (
      <>
        <div
          className={cn(
            "flex min-h-[38%] flex-col items-center justify-center pt-5 pr-1 pb-1 pl-1 text-center font-extrabold",
            textOn(colors[0]!),
          )}
          style={bandStyle(colors)}
        >
          {valueBadge}
          <span className="drop-shadow-sm">{c.kind === "wild" ? "WILD" : c.name}</span>
        </div>
        <div className="flex flex-1 flex-col justify-center gap-0.5 px-1.5 py-1">
          {c.kind === "wild" && (
            <span className="text-center font-bold">{colors.length > 2 ? "Any colour" : c.name.replace(" Wild", "")}</span>
          )}
          {using && <span className="text-center text-[0.95em] text-black/70">Rent {COLOR_INFO[using].rent.join(" · ")}</span>}
          {c.kind === "wild" && color && <span className="text-center font-semibold">as {COLOR_INFO[color].name}</span>}
        </div>
      </>
    );
  } else if (c.kind === "rent") {
    body = (
      <>
        <div
          className="flex min-h-[38%] items-center justify-center pt-3 font-black tracking-wider text-white"
          style={bandStyle(c.colors)}
        >
          {valueBadge}
          <span className="drop-shadow">RENT</span>
        </div>
        <div className="flex flex-1 items-center justify-center p-1 text-center font-semibold">
          {c.any
            ? "Any colour · one player pays"
            : `${COLOR_INFO[c.colors[0]!].name} or ${COLOR_INFO[c.colors[1]!].name} · everyone pays`}
        </div>
      </>
    );
  } else {
    const isNo = c.action === "justSayNo";
    const isBreaker = c.action === "dealBreaker";
    body = (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center gap-1 p-1.5 text-center",
          isNo ? "bg-[#ffd9d9]" : isBreaker ? "bg-[#1d1d1d] text-white" : "bg-[#efe3ff]",
        )}
      >
        {valueBadge}
        <span className="text-[0.85em] font-bold tracking-widest uppercase opacity-60">action</span>
        <span className="font-display text-[1.25em] font-black">{c.name}</span>
        {size !== "sm" && <span className="text-[0.95em] opacity-75">{c.text}</span>}
      </div>
    );
  }
  const label = `${c.name}${c.value ? `, worth ${money(c.value)}` : ""}${selected ? ", selected" : ""}`;
  return onClick ? (
    <button type="button" className={base} onClick={onClick} aria-label={label} aria-pressed={selected}>
      {body}
    </button>
  ) : (
    <div className={base} role="img" aria-label={label}>
      {body}
    </div>
  );
}

// ───────────────────────── Table ─────────────────────────

function PileView({
  pile,
  onCard,
  picked,
  pickable,
  compact,
}: {
  pile: Pile;
  onCard?: (id: string) => void;
  picked?: string[];
  pickable?: (id: string) => boolean;
  compact?: boolean;
}) {
  const info = COLOR_INFO[pile.color];
  const full = isComplete(pile);
  const extras = [pile.house, pile.hotel].filter(Boolean) as string[];
  return (
    <div
      className={cn(
        "rounded-xl border-2 p-1.5",
        full ? "border-amber bg-amber/10 shadow-[0_0_14px_rgba(255,193,69,0.35)]" : "border-border bg-surface-2/70",
      )}
    >
      <div className="mb-1 flex items-center gap-1.5 px-0.5 text-xs font-bold">
        <span className="size-3 rounded-full ring-1 ring-black/30" style={{ background: info.hex }} aria-hidden />
        {info.name}
        <span className="text-muted font-mono">
          {pile.cards.length}/{info.size}
        </span>
        {full && <span className="text-amber">FULL</span>}
        {pile.house && <Home className="text-mint size-3.5" aria-label="House" />}
        {pile.hotel && <Hotel className="text-coral size-3.5" aria-label="Hotel" />}
      </div>
      <div className="flex">
        {[...pile.cards, ...extras].map((id, i) => {
          const can = !!onCard && (!pickable || pickable(id));
          return (
            <div key={id} className={cn(i > 0 && (compact ? "-ml-12" : "-ml-9"))}>
              <DealCard
                id={id}
                size="sm"
                color={card(id).kind === "wild" ? pile.color : undefined}
                selected={picked?.includes(id)}
                dim={!!onCard && !can}
                onClick={can ? () => onCard!(id) : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlayerTable({
  pub,
  id,
  names,
  me,
  onCard,
  picked,
  pickable,
  compact,
}: {
  pub: PropertyDealPublic;
  id: string;
  names: Record<string, string>;
  me: string;
  onCard?: (id: string) => void;
  picked?: string[];
  pickable?: (id: string) => boolean;
  compact?: boolean;
}) {
  const piles = pub.props[id]!;
  const bank = pub.banks[id]!;
  const sets = new Set(completeColors(piles)).size;
  const bankCards = bank.filter((c) => !pickable || pickable(c));
  return (
    <section
      aria-label={`${names[id] ?? "Player"}'s table`}
      className={cn(
        "rounded-2xl border p-3",
        pub.turn === id && !pub.over ? "border-amber bg-amber/5" : "border-border bg-surface/60",
        pub.winner === id && "border-mint bg-mint/10",
      )}
    >
      <header className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="font-display text-lg font-extrabold">
          {names[id] ?? "Player"}
          {id === me && <span className="text-muted text-sm font-semibold"> (you)</span>}
        </h3>
        {pub.turn === id && !pub.over && <span className="text-amber text-sm font-bold">▶ playing</span>}
        <span className="ml-auto flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1" title="Full sets">
            <Trophy className="text-amber size-4" aria-hidden />
            <strong>
              {sets}/{pub.setsToWin}
            </strong>
            <span className="sr-only">full sets</span>
          </span>
          <span className="flex items-center gap-1" title="Bank">
            <Landmark className="text-mint size-4" aria-hidden />
            <strong>{money(valueOf(bank))}</strong>
            <span className="sr-only">in the bank</span>
          </span>
          <span className="flex items-center gap-1" title="Cards in hand">
            <Layers className="text-sky size-4" aria-hidden />
            <strong>{pub.handCounts[id]}</strong>
            <span className="sr-only">cards in hand</span>
          </span>
        </span>
      </header>
      <div className="flex flex-wrap gap-2">
        {piles.map((p) => (
          <PileView key={p.color} pile={p} onCard={onCard} picked={picked} pickable={pickable} compact={compact} />
        ))}
        {piles.length === 0 && <p className="text-muted py-2 text-sm">No properties yet.</p>}
      </div>
      {onCard && bankCards.length > 0 && (
        <div className="mt-2">
          <p className="text-muted mb-1 text-xs font-bold uppercase">Bank</p>
          <div className="flex flex-wrap gap-1.5">
            {bankCards.map((c) => (
              <DealCard key={c} id={c} size="sm" selected={picked?.includes(c)} onClick={() => onCard(c)} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ───────────────────────── Requests ─────────────────────────

function describeRequest(r: DealRequest, names: Record<string, string>) {
  const actor = names[r.actor] ?? "Player";
  const who = r.targets.length > 1 ? "everyone" : (names[r.targets[0]!.player] ?? "Player");
  switch (r.kind) {
    case "rent":
    case "debtCollector":
    case "birthday":
      return `${actor} → ${who}: ${r.label}`;
    default:
      return `${actor} → ${who}: ${r.label}`;
  }
}

function RequestStatus({ r, names }: { r: DealRequest; names: Record<string, string> }) {
  return (
    <ul className="flex flex-wrap gap-2 text-sm">
      {r.targets.map((t) => (
        <li
          key={t.player}
          className={cn(
            "rounded-full border px-3 py-1",
            t.done ? "border-mint/50 bg-mint/10" : t.waiting === "actor" ? "border-rose/60 bg-rose/10" : "border-border",
          )}
        >
          {names[t.player] ?? "Player"}:{" "}
          {t.done
            ? t.outcome === "blocked"
              ? "said NO 🙅"
              : t.outcome === "paid"
                ? t.paid.length
                  ? `paid ${money(valueOf(t.paid))}`
                  : "broke"
                : "handed it over"
            : t.waiting === "actor"
              ? `Just Say No! (${names[r.actor]} to answer)`
              : "deciding…"}
        </li>
      ))}
    </ul>
  );
}

function RespondPanel({
  pub,
  priv,
  me,
  names,
  send,
}: {
  pub: PropertyDealPublic;
  priv: PropertyDealPrivate;
  me: string;
  names: Record<string, string>;
  send: Send;
}) {
  const r = pub.request!;
  const mine = r.targets.find((t) => t.player === me && !t.done && t.waiting === "target");
  const payable = payableCards(pub.banks[me]!, pub.props[me]!);
  const [picked, setPicked] = useState<string[]>(() =>
    mine && mine.amount ? suggestPayment(pub.banks[me]!, pub.props[me]!, mine.amount) : [],
  );
  const no = priv.hand.find((c) => isAction(c, "justSayNo"));
  const isMoney = r.kind === "rent" || r.kind === "debtCollector" || r.kind === "birthday";
  const actorTurns = me === r.actor ? r.targets.filter((t) => !t.done && t.waiting === "actor") : [];

  if (actorTurns.length) {
    return (
      <div className="border-rose/60 bg-rose/10 space-y-3 rounded-2xl border p-4">
        {actorTurns.map((t) => (
          <div key={t.player} className="space-y-2">
            <p className="font-display text-xl font-bold">{names[t.player]} played Just Say No! 🙅</p>
            <div className="flex flex-wrap gap-2">
              {no && (
                <Button size="lg" variant="danger" onClick={() => send({ type: "just-say-no", card: no, target: t.player })}>
                  <ShieldBan aria-hidden /> No to your No!
                </Button>
              )}
              <Button size="lg" variant="secondary" onClick={() => send({ type: "accept", target: t.player })}>
                Fine, let it go
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (!mine) return null;

  const total = valueOf(picked);
  const enough = total >= mine.amount || picked.length === payable.length;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const stealText =
    r.kind === "slyDeal"
      ? `${names[r.actor]} wants to steal your ${card(r.take!).name}.`
      : r.kind === "forcedDeal"
        ? `${names[r.actor]} wants to swap their ${card(r.give!).name} for your ${card(r.take!).name}.`
        : r.kind === "dealBreaker"
          ? `${names[r.actor]} wants your entire ${COLOR_INFO[r.color!].name} set! 😱`
          : "";

  return (
    <div className="border-amber/70 bg-amber/10 space-y-3 rounded-2xl border-2 p-4">
      <p className="font-display text-xl font-extrabold">
        {isMoney ? `${names[r.actor]} wants ${money(mine.amount)} from you` : stealText}
      </p>
      {isMoney && (
        <>
          <p className="text-muted text-sm">
            Tap cards from your bank and properties to pay. No change is given.{" "}
            {payable.length === 0 && "You have nothing to pay with."}
          </p>
          <PlayerTable
            pub={pub}
            id={me}
            names={names}
            me={me}
            onCard={toggle}
            picked={picked}
            pickable={(c) => payable.includes(c)}
            compact
          />
          <p className="font-semibold" aria-live="polite">
            Selected: {money(total)} of {money(mine.amount)}
            {!enough && " — not enough yet"}
          </p>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {isMoney ? (
          <Button size="lg" disabled={!enough} onClick={() => send({ type: "pay", cards: picked })}>
            Pay {money(total)}
          </Button>
        ) : (
          <Button size="lg" variant="secondary" onClick={() => send({ type: "accept" })}>
            Accept
          </Button>
        )}
        {no && (
          <Button size="lg" variant="danger" onClick={() => send({ type: "just-say-no", card: no })}>
            <ShieldBan aria-hidden /> Just Say No!
          </Button>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Playing a card ─────────────────────────

function Choice({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <Button
      size="lg"
      variant="secondary"
      className="h-auto min-h-12 py-2 whitespace-normal"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </Button>
  );
}

function Swatch({ color }: { color: Color }) {
  return (
    <span
      className="inline-block size-3.5 shrink-0 rounded-full ring-1 ring-black/30"
      style={{ background: COLOR_INFO[color].hex }}
      aria-hidden
    />
  );
}

function Composer({
  id,
  pub,
  me,
  hand,
  names,
  play,
}: {
  id: string;
  pub: PropertyDealPublic;
  me: string;
  hand: string[];
  names: Record<string, string>;
  play: (a: object) => void;
}) {
  const c = card(id);
  const others = pub.players.filter((p) => p !== me);
  const mine = pub.props[me]!;
  const [color, setColor] = useState<Color | null>(null);
  const [useDoubles, setUseDoubles] = useState(0);
  const [give, setGive] = useState<string | null>(null);
  const bank = c.kind !== "property" && c.kind !== "wild" && (
    <Choice onClick={() => play({ type: "bank", card: id })}>
      <Landmark aria-hidden /> Bank it ({money(c.value)})
    </Choice>
  );
  const playerPicker = (onPick: (p: string) => void) =>
    others.map((p) => (
      <Choice key={p} onClick={() => onPick(p)}>
        {names[p]} <span className="text-muted text-xs">({money(valueOf(payableCards(pub.banks[p]!, pub.props[p]!)))})</span>
      </Choice>
    ));
  const stealList = (from: string[], pick: (owner: string, card: string) => void) => {
    const items = from.flatMap((o) =>
      stealable(pub.props[o]!).map((cid) => ({ o, cid, color: pub.props[o]!.find((p) => p.cards.includes(cid))!.color })),
    );
    if (!items.length) return <p className="text-muted">Nothing to take — only properties outside full sets can be taken.</p>;
    return items.map(({ o, cid, color }) => (
      <Choice key={cid} onClick={() => pick(o, cid)}>
        <Swatch color={color} /> {card(cid).name} <span className="text-muted text-xs">({names[o]})</span>
      </Choice>
    ));
  };

  let content: React.ReactNode = null;
  let hint = "";
  if (c.kind === "money") content = bank;
  else if (c.kind === "property" || c.kind === "wild") {
    hint = "Where does it go?";
    content = (c.kind === "property" ? [c.color] : c.colors).map((col) => {
      const pile = pileOf(mine, col);
      return (
        <Choice key={col} onClick={() => play({ type: "property", card: id, color: col })}>
          <Swatch color={col} /> {COLOR_INFO[col].name}{" "}
          <span className="text-muted text-xs">
            ({pile?.cards.length ?? 0}/{COLOR_INFO[col].size})
          </span>
        </Choice>
      );
    });
  } else if (c.kind === "rent") {
    const colors = c.colors.filter((col) => rentOf(mine, col) > 0);
    const doublesInHand = hand.filter((h) => isAction(h, "doubleRent"));
    const maxDoubles = Math.min(doublesInHand.length, pub.playsLeft - 1, 2);
    if (!colors.length) {
      hint = "You don't own any of these colours yet.";
      content = bank;
    } else if (!color) {
      hint = "Charge rent for which colour?";
      content = (
        <>
          {colors.map((col) => (
            <Choice key={col} onClick={() => setColor(col)}>
              <Swatch color={col} /> {COLOR_INFO[col].name} · {money(rentOf(mine, col))}
            </Choice>
          ))}
          {bank}
        </>
      );
    } else {
      const amount = rentOf(mine, color) * 2 ** useDoubles;
      const fire = (t?: string) =>
        play({ type: "rent", card: id, color, ...(t ? { target: t } : {}), doubles: doublesInHand.slice(0, useDoubles) });
      hint = c.any
        ? `${COLOR_INFO[color].name} rent: ${money(amount)} — who pays?`
        : `${COLOR_INFO[color].name} rent: ${money(amount)} from everyone`;
      content = (
        <>
          {maxDoubles > 0 && (
            <Choice onClick={() => setUseDoubles((d) => (d + 1) % (maxDoubles + 1))}>
              Double the Rent: {useDoubles ? `×${2 ** useDoubles}` : "off"}
            </Choice>
          )}
          {c.any ? playerPicker((p) => fire(p)) : <Choice onClick={() => fire()}>Charge everyone {money(amount)}</Choice>}
        </>
      );
    }
  } else {
    switch (c.action) {
      case "passGo":
        content = (
          <>
            <Choice onClick={() => play({ type: "pass-go", card: id })}>Draw 2 cards</Choice>
            {bank}
          </>
        );
        break;
      case "birthday":
        content = (
          <>
            <Choice onClick={() => play({ type: "birthday", card: id })}>🎂 Everyone pays {money(2)}</Choice>
            {bank}
          </>
        );
        break;
      case "debtCollector":
        hint = `Who owes you ${money(5)}?`;
        content = (
          <>
            {playerPicker((p) => play({ type: "debt-collector", card: id, target: p }))}
            {bank}
          </>
        );
        break;
      case "slyDeal":
        hint = "Steal which property?";
        content = (
          <>
            {stealList(others, (o, take) => play({ type: "sly-deal", card: id, target: o, take }))}
            {bank}
          </>
        );
        break;
      case "forcedDeal": {
        const myLoose = stealable(mine);
        if (!give) {
          hint = "First: which of yours will you give away?";
          content = (
            <>
              {myLoose.length ? (
                myLoose.map((cid) => (
                  <Choice key={cid} onClick={() => setGive(cid)}>
                    <Swatch color={mine.find((p) => p.cards.includes(cid))!.color} /> {card(cid).name}
                  </Choice>
                ))
              ) : (
                <p className="text-muted">You need a property outside a full set to swap.</p>
              )}
              {bank}
            </>
          );
        } else {
          hint = `Swap ${card(give).name} for…`;
          content = stealList(others, (o, take) => play({ type: "forced-deal", card: id, target: o, take, give }));
        }
        break;
      }
      case "dealBreaker": {
        hint = "Steal which full set?";
        const sets = others.flatMap((o) => pub.props[o]!.filter(isComplete).map((p) => ({ o, color: p.color })));
        content = (
          <>
            {sets.length ? (
              sets.map(({ o, color: col }) => (
                <Choice key={o + col} onClick={() => play({ type: "deal-breaker", card: id, target: o, color: col })}>
                  <Swatch color={col} /> {names[o]}&apos;s {COLOR_INFO[col].name} set
                </Choice>
              ))
            ) : (
              <p className="text-muted">Nobody has a full set yet — save it or bank it.</p>
            )}
            {bank}
          </>
        );
        break;
      }
      case "house":
      case "hotel": {
        const ok = mine.filter(
          (p) => isComplete(p) && !NO_BUILDINGS.includes(p.color) && (c.action === "house" ? !p.house : !!p.house && !p.hotel),
        );
        hint = ok.length
          ? "Build on which set?"
          : c.action === "house"
            ? "Houses need a full set (not railroads/utilities)."
            : "Hotels need a full set with a house.";
        content = (
          <>
            {ok.map((p) => (
              <Choice key={p.color} onClick={() => play({ type: "build", card: id, color: p.color })}>
                <Swatch color={p.color} /> {COLOR_INFO[p.color].name}
              </Choice>
            ))}
            {bank}
          </>
        );
        break;
      }
      case "doubleRent":
        hint = "Play it together with a rent card (pick the rent card), or bank it.";
        content = bank;
        break;
      case "justSayNo":
        hint = "Keep it to block an attack — or bank it.";
        content = bank;
        break;
      default:
        content = bank;
    }
  }
  return (
    <div className="border-amber/60 bg-amber/10 rounded-2xl border p-3">
      <p className="mb-2 font-semibold">
        {c.name}
        {hint && <span className="text-muted font-normal"> — {hint}</span>}
      </p>
      <div className="flex flex-wrap gap-2">{content}</div>
    </div>
  );
}

// ───────────────────────── Main view ─────────────────────────

export function PropertyDealView({
  pub,
  priv,
  mode,
  game,
  me,
  names,
  send,
}: GameViewProps<PropertyDealPublic, PropertyDealPrivate>) {
  const [selected, setSelected] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState<string[] | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const meId = me.playerId;
  const handMode = mode === "hand" && !!priv;
  const r = pub.request;
  const myTurn = !pub.over && pub.turn === meId;
  const canPlay = myTurn && !r;
  const hand = priv?.hand ?? [];
  const mustDiscard = Math.max(0, hand.length - 7);
  const waitingOnMe = game.pending.includes(meId);

  const run = async (a: object) => {
    const ok = await send(a);
    if (ok) {
      setSelected(null);
      setDiscarding(null);
      setMoving(null);
    }
    return ok;
  };

  const status = pub.over
    ? pub.winner
      ? `🏆 ${names[pub.winner]} wins with ${pub.setsToWin} full sets!`
      : "Game over"
    : r
      ? waitingOnMe
        ? "Your move — respond!"
        : describeRequest(r, names)
      : myTurn
        ? `Your turn — ${pub.playsLeft} play${pub.playsLeft === 1 ? "" : "s"} left`
        : `${names[pub.turn]}'s turn · ${pub.playsLeft} play${pub.playsLeft === 1 ? "" : "s"} left`;

  const tableOrder = useMemo(() => {
    const i = pub.players.indexOf(meId);
    return i < 0 ? pub.players : [...pub.players.slice(i), ...pub.players.slice(0, i)];
  }, [pub.players, meId]);

  const centre = (
    <div className="flex flex-wrap items-center justify-center gap-5 py-1">
      <div className="flex flex-col items-center gap-1">
        <div className="shadow-card grid h-[6.4rem] w-[4.5rem] place-items-center rounded-xl border-2 border-white/80 bg-[#1f5c2e] font-black text-white">
          <Building2 className="size-7" aria-hidden />
        </div>
        <span className="text-muted text-xs font-semibold">Draw · {pub.deckCount}</span>
      </div>
      <AnimatePresence mode="popLayout">
        {pub.last && (
          <motion.div
            key={pub.last.card + pub.last.text}
            initial={{ scale: 0.6, rotate: -10, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className="flex items-center gap-3"
          >
            <DealCard id={pub.last.card} size={handMode ? "sm" : "lg"} />
            <p className={cn("max-w-sm font-semibold", handMode ? "text-sm" : "text-lg")}>{pub.last.text}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  if (!handMode) {
    return (
      <div className="space-y-4">
        <StatusBanner tone={pub.over ? "done" : "neutral"}>{status}</StatusBanner>
        <Countdown deadline={game.deadline} />
        {centre}
        {r && <RequestStatus r={r} names={names} />}
        <div className="grid gap-3 lg:grid-cols-2">
          {tableOrder.map((p) => (
            <PlayerTable key={p} pub={pub} id={p} names={names} me={meId} />
          ))}
        </div>
        <EventLog entries={pub.log} />
      </div>
    );
  }

  const moveOptions = moving
    ? colorsOf(moving).filter((c) => c !== pub.props[meId]!.find((p) => p.cards.includes(moving))?.color)
    : [];

  return (
    <div className="space-y-4">
      <StatusBanner tone={pub.over ? "done" : waitingOnMe ? "turn" : "wait"}>{status}</StatusBanner>
      <Countdown deadline={game.deadline} forMe={waitingOnMe} />
      {r && priv && (
        <RespondPanel
          key={`${r.card}-${r.targets.map((t) => t.waiting).join()}`}
          pub={pub}
          priv={priv}
          me={meId}
          names={names}
          send={run}
        />
      )}
      {r && !waitingOnMe && <RequestStatus r={r} names={names} />}
      {centre}

      <section aria-label="Your hand" className="border-border bg-surface-2/70 rounded-2xl border p-3">
        <p className="text-muted mb-1 text-sm font-semibold">
          Your hand · {hand.length} card{hand.length === 1 ? "" : "s"}
          {discarding && ` — pick ${mustDiscard} to discard (${discarding.length}/${mustDiscard})`}
        </p>
        <div className="flex flex-wrap justify-center gap-2 pt-3 pb-1">
          {hand.map((id) => (
            <DealCard
              key={id}
              id={id}
              selected={discarding ? discarding.includes(id) : selected === id}
              onClick={
                discarding
                  ? () => setDiscarding((d) => (d!.includes(id) ? d!.filter((x) => x !== id) : [...d!, id]))
                  : canPlay && pub.playsLeft > 0
                    ? () => setSelected((s) => (s === id ? null : id))
                    : undefined
              }
            />
          ))}
          {hand.length === 0 && <p className="text-muted py-6">No cards — you&apos;ll draw 5 next turn.</p>}
        </div>
      </section>

      {canPlay && selected && hand.includes(selected) && !discarding && (
        <Composer key={selected} id={selected} pub={pub} me={meId} hand={hand} names={names} play={run} />
      )}

      {canPlay && (
        <div className="flex flex-wrap items-center gap-2">
          {discarding ? (
            <>
              <Button
                size="lg"
                disabled={discarding.length !== mustDiscard}
                onClick={() => run({ type: "end-turn", discard: discarding })}
              >
                Discard & end turn
              </Button>
              <Button size="lg" variant="ghost" onClick={() => setDiscarding(null)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button
              size="lg"
              variant={pub.playsLeft === 0 ? "primary" : "secondary"}
              onClick={() => (mustDiscard ? setDiscarding([]) : run({ type: "end-turn" }))}
            >
              End turn{mustDiscard ? ` (discard ${mustDiscard})` : ""}
            </Button>
          )}
          <span className="text-muted text-sm">Tip: tap a wildcard on your table to move it (free).</span>
        </div>
      )}

      <PlayerTable
        pub={pub}
        id={meId}
        names={names}
        me={meId}
        onCard={canPlay ? (id) => setMoving((m) => (m === id ? null : id)) : undefined}
        pickable={(id) => card(id).kind === "wild"}
        picked={moving ? [moving] : []}
        compact
      />
      {moving && moveOptions.length > 0 && (
        <div className="border-sky/60 bg-sky/10 flex flex-wrap items-center gap-2 rounded-2xl border p-3">
          <span className="font-semibold">Move wildcard to:</span>
          {moveOptions.map((col) => (
            <Choice key={col} onClick={() => run({ type: "move-wild", card: moving, color: col })}>
              <Swatch color={col} /> {COLOR_INFO[col].name}
            </Choice>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {tableOrder
          .filter((p) => p !== meId)
          .map((p) => (
            <PlayerTable key={p} pub={pub} id={p} names={names} me={meId} compact />
          ))}
      </div>
      <EventLog entries={pub.log} />
    </div>
  );
}
