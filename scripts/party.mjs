// Prints the address phones should use, then starts the production server on all interfaces.
import { networkInterfaces } from "node:os";
import { spawn } from "node:child_process";

const port = process.env.PORT || "3000";
const ips = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === "IPv4" && !a.internal)
  .map((a) => a.address)
  .sort((a, b) => (b.startsWith("192.168.") ? 1 : 0) - (a.startsWith("192.168.") ? 1 : 0));

console.log("\n  🎉 Game Night is starting…\n");
if (ips.length) {
  console.log(`  Open this on the big screen (and it's what the QR code will use):\n\n     http://${ips[0]}:${port}\n`);
  if (ips.length > 1)
    console.log(
      `  Other addresses: ${ips
        .slice(1)
        .map((ip) => `http://${ip}:${port}`)
        .join("  ")}\n`,
    );
  console.log("  Phones must be on the same Wi-Fi.\n");
} else {
  console.log(`  No Wi-Fi address found — connect to Wi-Fi, then open http://localhost:${port}\n`);
}
const child = spawn("npx", ["next", "start", "-H", "0.0.0.0", "-p", port], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
