// Finds this computer's real Wi-Fi/Ethernet address, skipping the virtual
// networks macOS and other tools create (VPNs, Docker, Internet Sharing, VMs…).
import { hostname, networkInterfaces } from "node:os";

const VIRTUAL = /^(lo|bridge|utun|awdl|llw|vmnet|vboxnet|docker|br-|veth|anpi|ap\d|gif|stf|feth|ipsec|ppp|tun|tap|tailscale|zt)/i;

export function lanCandidates() {
  const out = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== "IPv4" || a.internal) continue;
      out.push({ name, address: a.address, virtual: VIRTUAL.test(name) || a.address.startsWith("169.254.") });
    }
  }
  const score = (c) =>
    (c.virtual ? 100 : 0) + (/^en\d+$/.test(c.name) ? Number(c.name.slice(2)) : /^(eth|wlan|wl)/.test(c.name) ? 10 : 50);
  return out.sort((a, b) => score(a) - score(b));
}

export function bestLanAddress() {
  return lanCandidates().find((c) => !c.virtual)?.address ?? null;
}

export function bonjourName() {
  const h = hostname().replace(/\.local$/i, "");
  return h ? `${h}.local` : null;
}
