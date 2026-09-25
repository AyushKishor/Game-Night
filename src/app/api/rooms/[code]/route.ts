import { clientIp, json, limit, route } from "@/lib/server/http";
import { getService } from "@/lib/server/service";
import { roomCodeSchema } from "@/lib/shared/protocol";

/** Public, non-secret room preview used by the join screen. */
export async function GET(req: Request, ctx: RouteContext<"/api/rooms/[code]">) {
  return route(async () => {
    limit("preview", clientIp(req));
    const code = roomCodeSchema.parse((await ctx.params).code);
    return json(await getService().preview(code));
  });
}
