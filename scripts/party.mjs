// `npm run party`: starts Game Night for phones on the same Wi-Fi and prints the address to open.
import { spawn } from "node:child_process";
import { bonjourName, lanCandidates } from "./network.mjs";

const port = process.env.PORT || "3000";
const all = lanCandidates();
const real = all.filter((c) => !c.virtual);

console.log("\n  🎉 Game Night is starting…\n");
if (real.length) {
  console.log("  On the Mac, open THIS address (the QR code will use it):\n");
  console.log(`     👉  http://${real[0].address}:${port}\n`);
  if (real.length > 1) {
    console.log("  If phones can't load it, try one of these instead:");
    for (const c of real.slice(1)) console.log(`       http://${c.address}:${port}   (${c.name})`);
    console.log("");
  }
  const bonjour = bonjourName();
  if (bonjour) console.log(`  iPhones can also try: http://${bonjour}:${port}\n`);
  console.log("  Phones must be on the SAME Wi-Fi as this computer (not guest Wi-Fi, not mobile data).");
  console.log("  Still stuck? Stop this (Control+C) and run:  npm run party:online\n");
} else {
  console.log("  ⚠️  No Wi-Fi address found. Connect this computer to Wi-Fi,");
  console.log("     or run  npm run party:online  to get a link that works anywhere.\n");
}
if (all.some((c) => c.virtual)) {
  console.log(
    `  (Ignoring virtual networks: ${all
      .filter((c) => c.virtual)
      .map((c) => `${c.name} ${c.address}`)
      .join(", ")})\n`,
  );
}
const child = spawn("npx", ["next", "start", "-H", "0.0.0.0", "-p", port], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
