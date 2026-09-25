import { bus } from "@/lib/server/realtime";

/**
 * Server-Sent Events fallback for realtime when Supabase isn't configured.
 * Streams only version numbers for a channel — no game data.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/realtime/[channel]">) {
  const { channel } = await ctx.params;
  if (!/^gn-room-[0-9a-f-]{36}$/.test(channel)) return new Response("Bad channel", { status: 400 });
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          cleanup();
        }
      };
      const onVersion = (v: number) => send(`data: ${JSON.stringify({ v })}\n\n`);
      const ping = setInterval(() => send(`: ping\n\n`), 15_000);
      bus.on(channel, onVersion);
      cleanup = () => {
        clearInterval(ping);
        bus.off(channel, onVersion);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
      send(`retry: 3000\n\n`);
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
