import { networkInterfaces } from "node:os";

/** IPv4 addresses of this machine on the local network (Wi-Fi / Ethernet). */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== "IPv4" || a.internal) continue;
      if (/^(docker|br-|veth|utun|awdl|llw|bridge|vmnet|vboxnet)/.test(name)) continue;
      out.push(a.address);
    }
  }
  // Prefer typical home-network ranges first.
  const rank = (ip: string) => (ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : ip.startsWith("172.") ? 2 : 3);
  return [...new Set(out)].sort((a, b) => rank(a) - rank(b));
}
