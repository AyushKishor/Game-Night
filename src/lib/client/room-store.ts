"use client";
import { useCallback, useEffect, useRef } from "react";
import { create } from "zustand";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { Command, StateResponse, CommandInput } from "@/lib/shared/protocol";
import { api, ApiRequestError } from "./api";
import { clearSession, loadSession, newActionId } from "./session";
import { play } from "./sound";

export type ConnectionStatus = "connecting" | "live" | "polling" | "offline";

export interface Toast {
  id: number;
  message: string;
  tone: "error" | "info" | "success";
}

interface RoomStore {
  code: string | null;
  data: StateResponse | null;
  status: ConnectionStatus;
  fatal: { code: string; message: string } | null;
  toast: Toast | null;
  clockOffset: number;
  pending: number;
  setData: (d: StateResponse) => void;
  showToast: (message: string, tone?: Toast["tone"]) => void;
  reset: (code: string) => void;
}

let toastId = 0;

export const useRoomStore = create<RoomStore>((set, get) => ({
  code: null,
  data: null,
  status: "connecting",
  fatal: null,
  toast: null,
  clockOffset: 0,
  pending: 0,
  setData: (d) => {
    const current = get().data;
    // Ignore stale responses that arrive out of order.
    if (current && d.room.version < current.room.version) return;
    set({ data: d, clockOffset: d.room.serverNow - Date.now(), fatal: null });
  },
  showToast: (message, tone = "error") => set({ toast: { id: ++toastId, message, tone } }),
  reset: (code) => set({ code, data: null, status: "connecting", fatal: null, toast: null, pending: 0 }),
}));

/** Server-synchronised "now" for countdowns. */
export function serverNow(): number {
  return Date.now() + useRoomStore.getState().clockOffset;
}

const FATAL_CODES = new Set(["room_not_found", "room_expired", "unauthorized", "not_in_room"]);

let supabase: SupabaseClient | null | undefined;
async function getSupabase(): Promise<SupabaseClient | null> {
  if (supabase !== undefined) return supabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return (supabase = null);
  const { createClient } = await import("@supabase/supabase-js");
  supabase = createClient(url, key, { auth: { persistSession: false } });
  return supabase;
}

/**
 * Keeps one room in sync: initial load, realtime "version changed" pings,
 * heartbeats, timer wake-ups, polling fallback and reconnection.
 */
export function useRoomConnection(code: string) {
  const store = useRoomStore;
  const syncing = useRef(false);
  const queued = useRef(false);
  const failures = useRef(0);

  const sync = useCallback(async () => {
    const session = loadSession(code);
    if (!session) {
      store.setState({ fatal: { code: "no_session", message: "Join the room to play." } });
      return;
    }
    if (syncing.current) {
      queued.current = true;
      return;
    }
    syncing.current = true;
    try {
      const data = await api.sync(code, session.token);
      failures.current = 0;
      store.getState().setData(data);
      if (store.getState().status === "offline") store.setState({ status: "polling" });
    } catch (err) {
      if (err instanceof ApiRequestError && FATAL_CODES.has(err.code)) {
        if (err.code !== "room_not_found" && err.code !== "room_expired") clearSession(code);
        store.setState({ fatal: { code: err.code, message: err.message } });
      } else {
        failures.current++;
        if (failures.current >= 2) store.setState({ status: "offline" });
      }
    } finally {
      syncing.current = false;
      if (queued.current) {
        queued.current = false;
        void sync();
      }
    }
  }, [code, store]);

  // Initial load + realtime subscription.
  useEffect(() => {
    store.getState().reset(code);
    void sync();
    let channel: RealtimeChannel | null = null;
    let source: EventSource | null = null;
    let cancelled = false;
    let subscribedTo: string | null = null;

    const onVersion = (v: number) => {
      const current = store.getState().data?.room.version ?? 0;
      if (v > current) void sync();
    };

    const subscribe = async (topic: string) => {
      if (subscribedTo === topic) return;
      subscribedTo = topic;
      const sb = await getSupabase();
      if (cancelled) return;
      if (sb) {
        channel = sb
          .channel(topic)
          .on("broadcast", { event: "version" }, (msg) => onVersion(Number(msg.payload?.v ?? 0)))
          .subscribe((status) => {
            store.setState({ status: status === "SUBSCRIBED" ? "live" : "polling" });
            if (status === "SUBSCRIBED") void sync();
          });
      } else if (typeof EventSource !== "undefined") {
        source = new EventSource(`/api/realtime/${topic}`);
        source.onopen = () => {
          store.setState({ status: "live" });
          void sync();
        };
        source.onmessage = (e) => {
          try {
            onVersion(Number(JSON.parse(e.data).v));
          } catch {}
        };
        source.onerror = () => {
          if (store.getState().status === "live") store.setState({ status: "polling" });
        };
      } else {
        store.setState({ status: "polling" });
      }
    };

    const unsub = store.subscribe((s) => {
      if (s.data?.room.channel) void subscribe(s.data.room.channel);
    });

    return () => {
      cancelled = true;
      unsub();
      source?.close();
      if (channel) void supabase?.removeChannel(channel);
    };
  }, [code, store, sync]);

  // Heartbeat / polling fallback.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      const status = store.getState().status;
      const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
      const interval = status === "live" ? 8000 : status === "offline" ? 4000 : 2500;
      timer = setTimeout(
        () => {
          if (!store.getState().fatal) void sync();
          loop();
        },
        hidden ? Math.max(interval, 15000) : interval,
      );
    };
    loop();
    const wake = () => void sync();
    window.addEventListener("online", wake);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", wake);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [store, sync]);

  // Wake the server when a timer expires or a bot is due to move.
  const wakeAt = useRoomStore((s) => s.data?.room.game?.wakeAt ?? null);
  useEffect(() => {
    if (!wakeAt) return;
    const delay = Math.max(0, wakeAt - serverNow()) + 150 + Math.random() * 400;
    const t = setTimeout(() => void sync(), Math.min(delay, 60_000));
    return () => clearTimeout(t);
  }, [wakeAt, sync]);

  return { sync };
}

/** Send an intention to the server. Retries network failures with the same action ID. */
export function useSend(code: string) {
  return useCallback(
    async (command: CommandInput): Promise<boolean> => {
      const session = loadSession(code);
      if (!session) return false;
      const actionId = newActionId();
      const body = { ...command, actionId };
      useRoomStore.setState((s) => ({ pending: s.pending + 1 }));
      try {
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            const res = await api.action(code, session.token, body);
            if ("left" in res) {
              clearSession(code);
              useRoomStore.setState({ fatal: { code: "left", message: "You left the room." } });
              return true;
            }
            useRoomStore.getState().setData(res);
            return true;
          } catch (err) {
            if (err instanceof ApiRequestError && err.isNetwork && attempt < 3) {
              await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
              continue;
            }
            throw err;
          }
        }
        return false;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong.";
        if (err instanceof ApiRequestError && FATAL_CODES.has(err.code)) {
          useRoomStore.setState({ fatal: { code: err.code, message } });
        } else {
          useRoomStore.getState().showToast(message);
          play("error");
        }
        return false;
      } finally {
        useRoomStore.setState((s) => ({ pending: s.pending - 1 }));
      }
    },
    [code],
  );
}
