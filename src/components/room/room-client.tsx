"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, LogOut, Monitor, Smartphone } from "lucide-react";
import { Brand } from "@/components/app/brand";
import { SettingsMenu, SoundToggle } from "@/components/app/settings-menu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ViewMode } from "@/components/game/types";
import { useRoomConnection, useRoomStore, useSend } from "@/lib/client/room-store";
import { cn } from "@/lib/utils";
import { ConnectionBadge } from "./connection-badge";
import { GameStage } from "./game-stage";
import { Lobby } from "./lobby";
import { Results } from "./results";
import { useRoomSounds } from "./use-room-sounds";

function useViewMode(code: string, defaultMode: ViewMode) {
  const [mode, setMode] = useState<ViewMode | null>(null);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`gn:view:${code}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser-only storage after mount
      if (saved === "table" || saved === "hand") setMode(saved);
    } catch {}
  }, [code]);
  const update = (m: ViewMode) => {
    setMode(m);
    try {
      sessionStorage.setItem(`gn:view:${code}`, m);
    } catch {}
  };
  return [mode ?? defaultMode, update] as const;
}

export function RoomClient({ code }: { code: string }) {
  const router = useRouter();
  useRoomConnection(code);
  const data = useRoomStore((s) => s.data);
  const fatal = useRoomStore((s) => s.fatal);
  const send = useSend(code);
  useRoomSounds(data);

  const isWide = typeof window !== "undefined" && window.matchMedia?.("(min-width: 900px)").matches;
  const [mode, setMode] = useViewMode(code, data?.me.isHost && isWide ? "table" : "hand");

  useEffect(() => {
    if (fatal?.code === "no_session") router.replace(`/join?code=${code}`);
  }, [fatal, code, router]);

  const names = useMemo(() => {
    if (!data) return {};
    const n: Record<string, string> = { ...data.room.formerNames };
    for (const p of data.room.players) n[p.id] = p.name;
    return n;
  }, [data]);

  if (fatal && fatal.code !== "no_session") {
    const title =
      fatal.code === "left"
        ? "You left the room"
        : fatal.code === "room_expired"
          ? "This room has closed"
          : fatal.code === "room_not_found"
            ? "Room not found"
            : "You're not in this room any more";
    return (
      <main id="main" className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-6">
        <Brand />
        <div className="border-border bg-surface shadow-soft mt-10 rounded-3xl border p-8" role="alert">
          <AlertTriangle className="text-amber size-8" aria-hidden />
          <h1 className="font-display mt-3 text-2xl font-extrabold">{title}</h1>
          <p className="text-muted mt-2">
            {fatal.code === "unauthorized" || fatal.code === "not_in_room"
              ? "Your session ended — the host may have removed you, or it expired."
              : fatal.message}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {(fatal.code === "unauthorized" || fatal.code === "not_in_room" || fatal.code === "left") && (
              <Button asChild>
                <Link href={`/join?code=${code}`}>Join again</Link>
              </Button>
            )}
            <Button asChild variant="secondary">
              <Link href="/">Home</Link>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main id="main" className="text-muted flex flex-1 items-center justify-center gap-3" role="status">
        <Loader2 className="animate-spin" aria-hidden /> Connecting to room {code}…
      </main>
    );
  }

  const { room, me } = data;
  const inGame = room.game?.players.includes(me.playerId) ?? false;
  const effectiveMode: ViewMode = me.isSpectator ? "table" : mode;

  return (
    <div className={cn("flex min-h-dvh flex-col", effectiveMode === "table" && "lg:text-[1.06rem]")}>
      <header className="border-border/70 bg-bg/90 supports-[backdrop-filter]:bg-bg/75 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-2 px-3 py-2 sm:px-5">
          <Brand className="hidden sm:inline-flex" />
          <span
            className="bg-surface-2 rounded-lg px-2.5 py-1 font-mono text-sm font-bold tracking-[0.25em]"
            aria-label={`Room code ${room.code.split("").join(" ")}`}
          >
            {room.code}
          </span>
          <ConnectionBadge />
          <div className="ml-auto flex items-center gap-1">
            {!me.isSpectator && (
              <Tabs value={effectiveMode} onValueChange={(v) => setMode(v as ViewMode)}>
                <TabsList aria-label="Screen mode">
                  <TabsTrigger value="table" title="Shared screen: public table only">
                    <Monitor className="size-4" aria-hidden />
                    <span className="hidden sm:inline">Table</span>
                  </TabsTrigger>
                  <TabsTrigger value="hand" title="Personal: your cards and actions">
                    <Smartphone className="size-4" aria-hidden />
                    <span className="hidden sm:inline">{inGame ? "My hand" : "Me"}</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            <SoundToggle />
            <SettingsMenu />
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Leave room" title="Leave room">
                  <LogOut />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogTitle>Leave the room?</DialogTitle>
                <DialogDescription>
                  {inGame && room.phase === "playing"
                    ? "The game will continue and the computer will play your seat."
                    : "You can rejoin with the room code while the room is open."}
                  {me.isHost && " Someone else will become the host."}
                </DialogDescription>
                <div className="mt-6 flex justify-end gap-2">
                  <DialogClose asChild>
                    <Button variant="secondary">Stay</Button>
                  </DialogClose>
                  <Button variant="danger" onClick={() => send({ kind: "leave" })}>
                    Leave room
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-3 py-4 sm:px-5 sm:py-6">
        {me.isSpectator && (
          <p className="bg-violet/10 text-violet mb-4 rounded-xl px-4 py-2 text-sm font-medium" role="status">
            You&apos;re watching as a spectator.
          </p>
        )}
        {room.phase === "lobby" && <Lobby data={data} mode={effectiveMode} send={send} names={names} />}
        {room.phase === "playing" && room.game && (
          <GameStage data={data} mode={effectiveMode} send={send} names={names} onSwitchToHand={() => setMode("hand")} />
        )}
        {room.phase === "results" && <Results data={data} send={send} names={names} mode={effectiveMode} />}
      </main>
    </div>
  );
}
