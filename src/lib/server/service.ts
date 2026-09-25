import { MemoryStore } from "./memory-store";
import { PostgresStore } from "./pg-store";
import { publishVersion } from "./realtime";
import { RoomService } from "./rooms";

const g = globalThis as unknown as { __gnService?: RoomService };

function numberEnv(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Process-wide RoomService (survives Next.js dev hot reloads). */
export function getService(): RoomService {
  if (g.__gnService) return g.__gnService;
  const url = process.env.DATABASE_URL;
  if (!url && process.env.NODE_ENV === "production" && process.env.ALLOW_MEMORY_STORE !== "1") {
    console.warn("[game-night] DATABASE_URL is not set; using the in-memory store (single instance only).");
  }
  const store = url ? new PostgresStore(url) : new MemoryStore();
  g.__gnService = new RoomService({
    store,
    publish: publishVersion,
    roomIdleMs: numberEnv("ROOM_IDLE_MINUTES", 180) * 60_000,
    botDelayMs: numberEnv("BOT_DELAY_MS", 1200),
    sessionTtlMs: numberEnv("SESSION_TTL_HOURS", 24) * 60 * 60_000,
  });
  return g.__gnService;
}
