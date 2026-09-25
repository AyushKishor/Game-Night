import { clientIp, json, limit, readBody, route } from "@/lib/server/http";
import { getService } from "@/lib/server/service";
import { createRoomSchema } from "@/lib/shared/protocol";

export async function POST(req: Request) {
  return route(async () => {
    limit("create", clientIp(req));
    const body = await readBody(req, createRoomSchema);
    return json(await getService().createRoom(body), 201);
  });
}
