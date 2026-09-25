import { bearer, clientIp, json, limit, readBody, route } from "@/lib/server/http";
import { RoomError } from "@/lib/server/rooms";
import { getService } from "@/lib/server/service";
import { commandSchema, roomCodeSchema } from "@/lib/shared/protocol";

/** Players send intentions; the server validates and applies them. */
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/action">) {
  return route(async () => {
    const token = bearer(req);
    limit("action", token || clientIp(req));
    const code = roomCodeSchema.parse((await ctx.params).code);
    const cmd = await readBody(req, commandSchema);
    try {
      return json(await getService().command(code, token, cmd));
    } catch (err) {
      if (err instanceof RoomError && err.code === "left") return json({ left: true });
      throw err;
    }
  });
}
