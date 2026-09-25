import { z } from "zod";
import { clientIp, json, limit, readBody, route } from "@/lib/server/http";
import { getService } from "@/lib/server/service";
import { roomCodeSchema } from "@/lib/shared/protocol";

const schema = z.object({ handoff: z.string().min(8).max(64) });

export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/redeem">) {
  return route(async () => {
    limit("join", clientIp(req));
    const code = roomCodeSchema.parse((await ctx.params).code);
    const { handoff } = await readBody(req, schema);
    return json(await getService().redeemHandoff(code, handoff));
  });
}
