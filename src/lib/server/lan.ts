import { networkInterfaces } from "node:os";

const VIRTUAL = /^(lo|bridge|utun|awdl|llw|vmnet|vboxnet|docker|br-|veth|anpi|ap\d|gif|stf|feth|ipsec|ppp|tun|tap|tailscale|zt)/i;

/**
 * This computer's real network addresses, best first. Virtual interfaces
 * (VPNs, Docker, Internet Sharing, VMs) are skipped — phones can't reach them.
 * Same rules as scripts/network.mjs.
 */
export function lanAddresses(): string[] {
  const out: { name: string; address: string }[] = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== "IPv4" || a.internal || a.address.startsWith("169.254.") || VIRTUAL.test(name)) continue;
      out.push({ name, address: a.address });
    }
  }
  const score = (c: { name: string }) =>
    /^en\d+$/.test(c.name) ? Number(c.name.slice(2)) : /^(eth|wlan|wl)/.test(c.name) ? 10 : 50;
  return [...new Set(out.sort((a, b) => score(a) - score(b)).map((c) => c.address))];
}
