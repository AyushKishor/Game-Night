import { json, route } from "@/lib/server/http";
import { getService } from "@/lib/server/service";

/** Idle-room cleanup. Scheduled by Vercel Cron (see vercel.json). */
export async function GET(req: Request) {
  return route(async () => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
      return json({ error: "Unauthorized", code: "unauthorized" }, 401);
    }
    const removed = await getService().cleanup();
    return json({ removed });
  });
}
