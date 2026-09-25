import { bearer, clientIp, json, limit, route } from "@/lib/server/http";
import { getService } from "@/lib/server/service";
import { roomCodeSchema } from "@/lib/shared/protocol";

/** Creates a short-lived, single-use link to continue on another device. */
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/handoff">) {
  return route(async () => {
    const token = bearer(req);
    limit("join", token || clientIp(req));
    const code = roomCodeSchema.parse((await ctx.params).code);
    return json(await getService().createHandoff(code, token));
  });
}
