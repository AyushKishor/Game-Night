import { bearer, clientIp, json, limit, route } from "@/lib/server/http";
import { getService } from "@/lib/server/service";
import { roomCodeSchema } from "@/lib/shared/protocol";

/** Heartbeat + reconnect + timer tick. Returns the caller's filtered view. */
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/sync">) {
  return route(async () => {
    const token = bearer(req);
    limit("sync", token || clientIp(req));
    const code = roomCodeSchema.parse((await ctx.params).code);
    return json(await getService().sync(code, token));
  });
}
