// `npm run party:online`: runs Game Night on this computer and opens a free,
// temporary public HTTPS link (Cloudflare Quick Tunnel). Works on any network:
// phones on mobile data, guest Wi-Fi, or a Fire TV. No account needed.
// The link changes every time and stops working when you press Control+C.
import { spawn } from "node:child_process";

const port = process.env.PORT || "3000";
const server = spawn("npx", ["next", "start", "-p", port], { stdio: ["ignore", "pipe", "inherit"] });
let tunnel = null;
let announced = false;

server.stdout.on("data", (buf) => {
  const text = buf.toString();
  if (!tunnel && /ready|started|Local:/i.test(text)) startTunnel();
});
setTimeout(() => !tunnel && startTunnel(), 8000);

function startTunnel() {
  if (tunnel) return;
  console.log("\n  🌍 Creating your online link (first time downloads a small helper)…\n");
  tunnel = spawn("npx", ["-y", "cloudflared", "tunnel", "--no-autoupdate", "--url", `http://localhost:${port}`], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const onData = (buf) => {
    const m = buf.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && !announced) {
      announced = true;
      console.log("  ✅ Game Night is online!\n");
      console.log(`     👉  ${m[0]}\n`);
      console.log("  Open that link on the Mac (or Fire TV) and click “Host a game”.");
      console.log("  Phones scan the QR code — any network works, even mobile data.");
      console.log("  Keep this window open. Control+C stops everything.\n");
    }
  };
  tunnel.stdout.on("data", onData);
  tunnel.stderr.on("data", onData);
  tunnel.on("exit", (code) => {
    if (!announced)
      console.log(`\n  ⚠️  Couldn't create the online link (code ${code}). Check your internet connection and try again.\n`);
  });
}

const stop = () => {
  tunnel?.kill();
  server.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => {
  tunnel?.kill();
  process.exit(code ?? 0);
});
