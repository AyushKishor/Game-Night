import { clientIp, json, limit, readBody, route } from "@/lib/server/http";
import { getService } from "@/lib/server/service";
import { joinRoomSchema, roomCodeSchema } from "@/lib/shared/protocol";

export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/join">) {
  return route(async () => {
    limit("join", clientIp(req));
    const code = roomCodeSchema.parse((await ctx.params).code);
    const body = await readBody(req, joinRoomSchema);
    return json(await getService().join(code, body), 201);
  });
}
