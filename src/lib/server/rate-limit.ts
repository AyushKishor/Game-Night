/**
 * Fixed-window in-memory rate limiter. Per instance — good enough to blunt
 * scripted abuse of room creation, joining and submissions. For strict
 * global limits behind many serverless instances, back this with Redis/KV.
 */
interface Bucket {
  count: number;
  resetAt: number;
}
const g = globalThis as unknown as { __gnRate?: Map<string, Bucket> };
const buckets: Map<string, Bucket> = g.__gnRate ?? (g.__gnRate = new Map());

export const LIMITS = {
  create: { max: 8, windowMs: 60_000 },
  join: { max: 20, windowMs: 60_000 },
  action: { max: 40, windowMs: 10_000 },
  sync: { max: 90, windowMs: 60_000 },
  preview: { max: 60, windowMs: 60_000 },
} as const;

export function rateLimit(kind: keyof typeof LIMITS, key: string, now = Date.now()): { ok: boolean; retryAfter: number } {
  if (process.env.RATE_LIMIT_DISABLED === "1") return { ok: true, retryAfter: 0 };
  const { max, windowMs } = LIMITS[kind];
  const id = `${kind}:${key}`;
  let b = buckets.get(id);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(id, b);
  }
  b.count++;
  if (buckets.size > 50_000) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }
  return b.count <= max ? { ok: true, retryAfter: 0 } : { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
}
