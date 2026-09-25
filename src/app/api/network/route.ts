import { json } from "@/lib/server/http";
import { lanAddresses } from "@/lib/server/lan";

/**
 * When the host screen is opened as http://localhost, phones can't reach that
 * address. This tells the page which Wi-Fi address to put in the QR code
 * instead. Only answers for requests that come from this machine itself.
 */
export async function GET(req: Request) {
  // The Host header is what the browser typed (req.url can report the bind address, e.g. 0.0.0.0).
  const host = (req.headers.get("host") ?? "").replace(/:\d+$/, "").toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  if (!local) return json({ addresses: [] });
  return json({ addresses: lanAddresses() });
}
