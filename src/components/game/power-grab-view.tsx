"use client";
import { useState } from "react";
import { Coins, ShieldAlert, Skull } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ACT_INFO,
  type ActKind,
  BLOCKERS,
  type PowerGrabPrivate,
  type PowerGrabPublic,
  ROLE_INFO,
  type Role,
} from "@/games/power-grab";
import { cn } from "@/lib/utils";
import { Countdown, EventLog, StatusBanner } from "./common";
import type { GameViewProps } from "./types";

function RoleCard({
  role,
  lost,
  hidden,
  size = "md",
  selected,
  onClick,
}: {
  role?: Role;
  lost?: boolean;
  hidden?: boolean;
  size?: "sm" | "md";
  selected?: boolean;
  onClick?: () => void;
}) {
  const info = role ? ROLE_INFO[role] : null;
  const cls = cn(
    "shadow-card relative flex shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 p-1.5 text-center text-white select-none",
    size === "sm" ? "h-20 w-14 text-[0.6rem]" : "h-36 w-26 text-xs",
    hidden ? "border-white/40 bg-[repeating-linear-gradient(45deg,#2d2150_0_8px,#3a2b66_8px_16px)]" : "border-white/80",
    lost && "opacity-40 grayscale",
    selected && "ring-amber ring-4",
    onClick && "cursor-pointer",
  );
  const body = hidden ? (
    <span className="text-2xl" aria-hidden>
      ❓
    </span>
  ) : (
    info && (
      <>
        <span className={size === "sm" ? "text-xl" : "text-4xl"} aria-hidden>
          {info.emoji}
        </span>
        <span className="font-display font-extrabold">{info.name}</span>
        {size === "md" && <span className="leading-tight opacity-85">{info.power}</span>}
        {lost && <Skull className="absolute top-1 right-1 size-4" aria-label="lost" />}
      </>
    )
  );
  const style = !hidden && info ? { background: info.color } : undefined;
  const label = hidden ? "Face-down card" : `${info?.name}${lost ? " (lost)" : ""}`;
  return onClick ? (
    <button type="button" className={cls} style={style} onClick={onClick} aria-label={label} aria-pressed={selected}>
      {body}
    </button>
  ) : (
    <div className={cls} style={style} role="img" aria-label={label}>
      {body}
    </div>
  );
}

function describe(pub: PowerGrabPublic, names: Record<string, string>): string {
  const a = pub.act;
  if (!a) return "";
  const info = ACT_INFO[a.kind];
  const target = a.target ? ` → ${names[a.target]}` : "";
  const claim = info.claim ? ` (claims ${ROLE_INFO[info.claim].name})` : "";
  const block = a.blocker ? ` · blocked by ${names[a.blocker]} (claims ${ROLE_INFO[a.blockRole!].name})` : "";
  return `${names[a.actor]}: ${info.name}${target}${claim}${block}`;
}

export function PowerGrabView({ pub, priv, mode, game, me, names, send }: GameViewProps<PowerGrabPublic, PowerGrabPrivate>) {
  const [target, setTarget] = useState<string | null>(null);
  const [keep, setKeep] = useState<string[]>([]);
  const meId = me.playerId;
  const handMode = mode === "hand" && !!priv;
  const imIn = (pub.influence[meId] ?? 0) > 0;
  const waiting = game.pending.includes(meId);
  const st = pub.stage;
  const others = pub.players.filter((p) => p !== meId && pub.influence[p]! > 0);
  const coins = pub.coins[meId] ?? 0;

  const status = pub.over
    ? `🏆 ${names[pub.winner!]} is the last one standing!`
    : st.k === "action"
      ? pub.turn === meId
        ? "Your turn — pick an action"
        : `${names[pub.turn]} is choosing…`
      : st.k === "challenge"
        ? `${names[st.claimant]} claims ${ROLE_INFO[st.role].name}. Anyone calling BS?`
        : st.k === "block"
          ? "Anyone blocking?"
          : st.k === "lose"
            ? `${names[st.player]} must give up a card`
            : `${names[pub.act?.actor ?? ""]} is exchanging cards…`;

  const act = async (kind: ActKind, t?: string) => {
    if (await send({ type: "act", kind, ...(t ? { target: t } : {}) })) setTarget(null);
  };

  const actionPanel = pub.turn === meId && st.k === "action" && (
    <div className="border-amber/60 bg-amber/10 space-y-3 rounded-2xl border p-3">
      <div>
        <p className="mb-1 text-sm font-semibold">Target (for Coup, Assassinate, Steal):</p>
        <div className="flex flex-wrap gap-2">
          {others.map((p) => (
            <Button
              key={p}
              variant={target === p ? "primary" : "secondary"}
              onClick={() => setTarget(p)}
              aria-pressed={target === p}
            >
              {names[p]} · {pub.coins[p]}🪙
            </Button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(ACT_INFO) as ActKind[]).map((k) => {
          const info = ACT_INFO[k];
          const forced = coins >= 10 && k !== "coup";
          const disabled = forced || coins < info.cost || (info.targeted && !target);
          return (
            <Button
              key={k}
              size="lg"
              variant={k === "coup" ? "danger" : "secondary"}
              className="h-auto min-h-14 flex-col gap-0 py-2 whitespace-normal"
              disabled={disabled}
              onClick={() => act(k, info.targeted ? target! : undefined)}
            >
              <span>
                {info.claim && ROLE_INFO[info.claim].emoji} {info.name}
              </span>
              <span className="text-muted text-xs font-normal">
                {k === "income" && "+1 coin, safe"}
                {k === "foreignAid" && "+2, Duke can block"}
                {k === "coup" && "Pay 7 · unstoppable"}
                {k === "tax" && "+3 · claim Duke"}
                {k === "assassinate" && "Pay 3 · claim Assassin"}
                {k === "steal" && "Take 2 · claim Captain"}
                {k === "exchange" && "Swap cards · claim Ambassador"}
              </span>
            </Button>
          );
        })}
      </div>
      <p className="text-muted text-xs">You can claim any character — lying is allowed. Just don&apos;t get caught.</p>
    </div>
  );

  const responsePanel = waiting && (st.k === "challenge" || st.k === "block") && (
    <div className="border-rose/60 bg-rose/10 space-y-2 rounded-2xl border p-3">
      <p className="font-display text-lg font-bold">{describe(pub, names)}</p>
      <div className="flex flex-wrap gap-2">
        {st.k === "challenge" && (
          <Button size="lg" variant="danger" onClick={() => send({ type: "challenge" })}>
            <ShieldAlert aria-hidden /> Challenge!
          </Button>
        )}
        {st.k === "block" &&
          pub.act &&
          BLOCKERS[pub.act.kind]!.map((r) => (
            <Button key={r} size="lg" variant="secondary" onClick={() => send({ type: "block", role: r })}>
              {ROLE_INFO[r].emoji} Block as {ROLE_INFO[r].name}
            </Button>
          ))}
        <Button size="lg" variant="ghost" onClick={() => send({ type: "allow" })}>
          Let it happen
        </Button>
      </div>
    </div>
  );

  const losePanel = waiting && st.k === "lose" && priv && (
    <div className="border-rose/60 bg-rose/10 space-y-2 rounded-2xl border p-3">
      <p className="font-display text-lg font-bold">{st.reason} — pick a card to give up.</p>
      <div className="flex gap-3">
        {priv.cards
          .filter((c) => !c.lost)
          .map((c) => (
            <RoleCard key={c.id} role={c.role} onClick={() => send({ type: "lose", card: c.id })} />
          ))}
      </div>
    </div>
  );

  const need = priv?.cards.filter((c) => !c.lost).length ?? 0;
  const exchangePanel = waiting && st.k === "exchange" && priv?.options && (
    <div className="border-sky/60 bg-sky/10 space-y-2 rounded-2xl border p-3">
      <p className="font-display text-lg font-bold">
        Keep {need} card{need === 1 ? "" : "s"}:
      </p>
      <div className="flex flex-wrap gap-3">
        {priv.options.map((o) => (
          <RoleCard
            key={o.id}
            role={o.role}
            selected={keep.includes(o.id)}
            onClick={() => setKeep((k) => (k.includes(o.id) ? k.filter((x) => x !== o.id) : k.length < need ? [...k, o.id] : k))}
          />
        ))}
      </div>
      <Button
        size="lg"
        disabled={keep.length !== need}
        onClick={async () => (await send({ type: "keep", cards: keep })) && setKeep([])}
      >
        Keep these
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <StatusBanner tone={pub.over ? "done" : waiting ? "turn" : "wait"}>{status}</StatusBanner>
      <Countdown deadline={game.deadline} forMe={waiting} />
      {pub.act && !pub.over && <p className="text-center font-semibold">{describe(pub, names)}</p>}
      {pub.reveal && (
        <p
          className={cn(
            "rounded-xl px-3 py-2 text-center font-bold",
            pub.reveal.proved ? "bg-mint/15 text-mint" : "bg-rose/15 text-rose",
          )}
        >
          {pub.reveal.proved
            ? `${names[pub.reveal.player]} really had the ${ROLE_INFO[pub.reveal.role].name}! ${ROLE_INFO[pub.reveal.role].emoji}`
            : `${names[pub.reveal.player]} was bluffing about the ${ROLE_INFO[pub.reveal.role].name}! 🤥`}
        </p>
      )}
      {handMode && (
        <>
          {responsePanel}
          {losePanel}
          {exchangePanel}
          {actionPanel}
          <section aria-label="Your cards" className="border-border bg-surface-2/70 rounded-2xl border p-3">
            <p className="text-muted mb-2 flex items-center gap-2 text-sm font-semibold">
              Your cards (secret) · <Coins className="text-amber size-4" aria-hidden /> {coins} coins
              {!imIn && <span className="text-rose">· you&apos;re out</span>}
            </p>
            <div className="flex justify-center gap-3">
              {priv!.cards.map((c) => (
                <RoleCard key={c.id} role={c.role} lost={c.lost} />
              ))}
            </div>
          </section>
        </>
      )}
      <ul className={cn("grid gap-2", handMode ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-3")} aria-label="Players">
        {pub.players.map((p) => {
          const out = pub.influence[p] === 0;
          return (
            <li
              key={p}
              className={cn(
                "bg-surface-2 rounded-xl border p-2",
                pub.turn === p && !pub.over ? "border-amber" : "border-border",
                pub.responders.includes(p) && "border-sky",
                out && "opacity-50",
              )}
            >
              <p className="flex items-center gap-2 font-semibold">
                {names[p]}
                {p === meId && <span className="text-muted text-xs">(you)</span>}
                <span className="ml-auto flex items-center gap-1 font-mono">
                  <Coins className="text-amber size-4" aria-hidden />
                  {pub.coins[p]}
                </span>
              </p>
              <div className="mt-1 flex gap-1.5">
                {Array.from({ length: pub.influence[p]! }, (_, i) => (
                  <RoleCard key={`h${i}`} hidden size="sm" />
                ))}
                {pub.lost[p]!.map((r, i) => (
                  <RoleCard key={`l${i}`} role={r} lost size="sm" />
                ))}
              </div>
              {pub.responders.includes(p) && <p className="text-sky mt-1 text-xs font-bold">deciding…</p>}
            </li>
          );
        })}
      </ul>
      <EventLog entries={pub.log} />
    </div>
  );
}
