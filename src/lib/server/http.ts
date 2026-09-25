import { ZodError, type ZodType } from "zod";
import { RoomError } from "./rooms";
import { rateLimit, type LIMITS } from "./rate-limit";

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim();
}

export function bearer(req: Request): string {
  const h = req.headers.get("authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorResponse(err: unknown) {
  if (err instanceof RoomError) return json({ error: err.message, code: err.code }, err.status);
  if (err instanceof ZodError) {
    return json({ error: err.issues[0]?.message ?? "Invalid request.", code: "bad_request" }, 422);
  }
  console.error("[game-night] unexpected error", err);
  return json({ error: "Something went wrong on our side. Please try again.", code: "server_error" }, 500);
}

export function limit(kind: keyof typeof LIMITS, key: string) {
  const r = rateLimit(kind, key);
  if (!r.ok) {
    throw new RoomError("rate_limited", `Slow down a little — try again in ${r.retryAfter}s.`, 429);
  }
}

export async function readBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const text = await req.text();
  if (text.length > 16_000) throw new RoomError("too_large", "Request too large.", 413);
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new RoomError("bad_json", "Malformed request.", 400);
  }
  return schema.parse(data);
}

export async function route(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    return errorResponse(err);
  }
}
