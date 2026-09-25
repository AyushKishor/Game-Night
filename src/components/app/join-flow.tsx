"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Eye, Loader2, Lock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api, ApiRequestError } from "@/lib/client/api";
import { loadSession, saveSession } from "@/lib/client/session";
import { AVATARS, type RoomPreview, roomCodeSchema } from "@/lib/shared/protocol";
import { NICKNAME_MAX } from "@/lib/shared/text";
import { AvatarPicker } from "./avatar-picker";
import { JoinCodeForm } from "./join-code-form";

type Load = { kind: "loading" } | { kind: "error"; code: string; message: string } | { kind: "ready"; preview: RoomPreview };

export function JoinFlow() {
  const params = useSearchParams();
  const router = useRouter();
  const rawCode = (params.get("code") ?? "").toUpperCase();
  const handoff = params.get("handoff");
  const parsed = roomCodeSchema.safeParse(rawCode);
  const code = parsed.success ? parsed.data : null;

  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string>(() => AVATARS[Math.floor(Math.random() * AVATARS.length)]!);
  const [spectator, setSpectator] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    let alive = true;
    (async () => {
      try {
        if (handoff) {
          const res = await api.redeem(code, handoff);
          saveSession(code, res.token, res.me.playerId);
          router.replace(`/room/${code}`);
          return;
        }
        if (loadSession(code)) {
          router.replace(`/room/${code}`);
          return;
        }
        const preview = await api.preview(code);
        if (alive) setLoad({ kind: "ready", preview });
      } catch (err) {
        if (!alive) return;
        const e = err instanceof ApiRequestError ? err : null;
        setLoad({ kind: "error", code: e?.code ?? "error", message: e?.message ?? "Couldn't load that room." });
      }
    })();
    return () => {
      alive = false;
    };
  }, [code, handoff, router]);

  if (!code) {
    return (
      <div className="mt-10 rounded-3xl border border-border bg-surface p-6 shadow-soft sm:p-8">
        <h1 className="font-display text-3xl font-extrabold">Join a game</h1>
        {rawCode && (
          <p role="alert" className="mt-2 font-medium text-rose">
            “{rawCode.slice(0, 12)}” isn&apos;t a valid room code.
          </p>
        )}
        <JoinCodeForm className="mt-6" />
      </div>
    );
  }

  if (load.kind === "loading") {
    return (
      <div className="mt-10 flex items-center gap-3 rounded-3xl border border-border bg-surface p-8 text-muted" role="status">
        <Loader2 className="animate-spin" aria-hidden /> Finding room {code}…
      </div>
    );
  }

  if (load.kind === "error") {
    return (
      <div className="mt-10 rounded-3xl border border-rose/50 bg-surface p-6 shadow-soft sm:p-8" role="alert">
        <AlertTriangle className="size-8 text-rose" aria-hidden />
        <h1 className="mt-3 font-display text-2xl font-extrabold">
          {load.code === "room_expired" ? "That room has closed" : load.code === "room_not_found" ? "Room not found" : "Can't join right now"}
        </h1>
        <p className="mt-2 text-muted">{load.message}</p>
        <JoinCodeForm className="mt-6" />
        <p className="mt-6 text-sm text-muted">
          Or{" "}
          <Link className="font-semibold text-sky hover:underline" href="/host">
            host your own game
          </Link>
          .
        </p>
      </div>
    );
  }

  const { preview } = load;
  const mustSpectate = preview.full;
  const blocked = preview.locked || (mustSpectate && !preview.allowSpectators);
  const asSpectator = mustSpectate || spectator;

  return (
    <div className="mt-10 rounded-3xl border border-border bg-surface p-6 shadow-soft sm:p-8">
      <p className="font-mono text-sm font-bold tracking-[0.3em] text-sky">ROOM {preview.code}</p>
      <h1 className="mt-1 font-display text-3xl font-extrabold">Join {preview.hostName}&apos;s game night</h1>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
        <span className="inline-flex items-center gap-1">
          <Users className="size-4" aria-hidden /> {preview.playerCount} {preview.playerCount === 1 ? "player" : "players"}
        </span>
        {preview.gameName && <span>Playing: {preview.gameName}</span>}
        {preview.phase === "playing" && <span className="text-amber">Game in progress — you&apos;ll join the next one</span>}
      </p>

      {preview.locked ? (
        <p role="alert" className="mt-6 flex items-center gap-2 rounded-xl bg-amber/10 p-4 font-medium text-amber">
          <Lock className="size-5 shrink-0" aria-hidden /> The host has locked this room. Ask them to unlock it.
        </p>
      ) : mustSpectate && !preview.allowSpectators ? (
        <p role="alert" className="mt-6 rounded-xl bg-rose/10 p-4 font-medium text-rose">
          This room is full and spectators are turned off.
        </p>
      ) : null}

      {!blocked && (
        <form
          className="mt-6 space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) {
              setError("Enter a nickname.");
              return;
            }
            setBusy(true);
            setError(null);
            try {
              const res = await api.join(code, { name: name.trim(), avatar, spectator: asSpectator });
              saveSession(code, res.token, res.me.playerId);
              router.push(`/room/${code}`);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Couldn't join.");
              setBusy(false);
            }
          }}
        >
          <div>
            <Label htmlFor="nickname">Nickname</Label>
            <Input
              id="nickname"
              className="mt-1.5"
              value={name}
              maxLength={NICKNAME_MAX}
              onChange={(e) => setName(e.target.value)}
              autoComplete="nickname"
              placeholder="What should we call you?"
              aria-invalid={!!error}
              aria-describedby={error ? "join-error" : undefined}
              autoFocus
            />
          </div>
          <div>
            <span className="text-sm font-semibold text-muted">Avatar (optional)</span>
            <div className="mt-1.5">
              <AvatarPicker value={avatar} onChange={setAvatar} />
            </div>
          </div>
          {preview.allowSpectators && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-bg-2 p-3">
              <Label htmlFor="spectate" className="flex items-center gap-2 text-base text-text">
                <Eye className="size-5 text-muted" aria-hidden />
                {mustSpectate ? "The room is full — join as a spectator" : "Just watch (spectator)"}
              </Label>
              <Switch id="spectate" checked={asSpectator} disabled={mustSpectate} onCheckedChange={setSpectator} />
            </div>
          )}
          {error && (
            <p id="join-error" role="alert" className="text-sm font-medium text-rose">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {busy ? "Joining…" : asSpectator ? "Watch the game" : "Join the game"}
          </Button>
        </form>
      )}
    </div>
  );
}
