import { EventEmitter } from "node:events";

/**
 * Realtime fan-out. Messages carry ONLY a room version number — never game
 * data — so a subscriber learns nothing except "something changed". Each
 * client then fetches its own filtered view over an authenticated request.
 *
 * - Supabase Realtime Broadcast when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   are configured (works across serverless instances).
 * - An in-process emitter feeding Server-Sent Events otherwise (single-node
 *   `next dev` / `next start`).
 * Clients additionally poll, so a realtime outage only slows updates down.
 */
type Bus = EventEmitter;
const g = globalThis as unknown as { __gnBus?: Bus };
export const bus: Bus = g.__gnBus ?? (g.__gnBus = new EventEmitter().setMaxListeners(0));

export function supabaseRealtimeConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function publishVersion(channel: string, version: number): Promise<void> {
  bus.emit(channel, version);
  if (!supabaseRealtimeConfigured()) return;
  const url = `${process.env.SUPABASE_URL}/realtime/v1/api/broadcast`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    await fetch(url, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ topic: channel, event: "version", payload: { v: version } }] }),
      signal: controller.signal,
    });
  } catch {
    // best-effort; clients fall back to polling
  } finally {
    clearTimeout(timer);
  }
}
