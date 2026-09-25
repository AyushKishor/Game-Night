import { json } from "@/lib/server/http";
import { supabaseRealtimeConfigured } from "@/lib/server/realtime";
import { getService } from "@/lib/server/service";

export async function GET() {
  return json({ ok: true, store: getService().store.kind, realtime: supabaseRealtimeConfigured() ? "supabase" : "sse" });
}
