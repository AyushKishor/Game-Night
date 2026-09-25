"use client";
import { useEffect, useRef } from "react";
import type { StateResponse } from "@/lib/shared/protocol";
import { play } from "@/lib/client/sound";

/** Derives sound cues from state changes. */
export function useRoomSounds(data: StateResponse | null) {
  const prev = useRef<StateResponse | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = data;
    if (!before || !data) return;
    const me = data.me.playerId;
    if (data.room.players.length > before.room.players.length) play("join");
    if (data.room.phase === "playing" && before.room.phase !== "playing") play("deal");
    const g = data.room.game;
    const bg = before.room.game;
    if (g && bg && g.roundSummaries.length > bg.roundSummaries.length) play("roundEnd");
    if (g && g.pending.includes(me) && !(bg?.pending.includes(me) ?? false) && data.room.phase === "playing") play("turn");
    if (data.room.phase === "results" && before.room.phase === "playing") {
      const mine = data.room.lastResults?.standings.find((s) => s.playerId === me);
      play(mine?.place === 1 ? "victory" : "roundEnd");
    }
  }, [data]);
}
