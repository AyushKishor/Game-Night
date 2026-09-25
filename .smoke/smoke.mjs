import { chromium } from "@playwright/test";
const SP = process.env.SP, BASE = "http://localhost:3100";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const hostCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const host = await hostCtx.newPage();
host.on("pageerror", (e) => console.log("HOST ERR", e.message));
await host.goto(BASE + "/");
await host.screenshot({ path: SP + "/01-home.png", fullPage: true });
await host.getByRole("link", { name: /host a game/i }).click();
await host.getByLabel("Your display name").fill("Ayush");
await host.getByRole("button", { name: "Create room" }).click();
await host.waitForURL(/\/room\//);
const code = host.url().split("/room/")[1];
console.log("code", code);
await host.getByText("Choose a game").first().waitFor();
const players = [];
for (const name of ["Mia", "Leo", "Zara"]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log(name, "ERR", e.message));
  await p.goto(`${BASE}/r/${code}`);
  await p.getByLabel("Nickname").fill(name);
  await p.getByRole("button", { name: "Join the game" }).click();
  await p.waitForURL(/\/room\//);
  players.push(p);
}
await host.getByRole("button", { name: "Choose", exact: true }).first().click();
await host.waitForTimeout(800);
await host.screenshot({ path: SP + "/02-lobby-host.png", fullPage: true });
for (const p of players) await p.getByRole("button", { name: "I'm ready" }).click();
await players[0].waitForTimeout(500);
await players[0].screenshot({ path: SP + "/03-lobby-phone.png", fullPage: true });
await host.getByRole("button", { name: /Start Crazy Eights/ }).click();
await host.waitForTimeout(1500);
await host.screenshot({ path: SP + "/04-table.png", fullPage: true });
await players[0].screenshot({ path: SP + "/05-hand.png", fullPage: true });
// Privacy: host table page must not contain Mia's cards
const miaCards = await players[0].locator('section[aria-label="Your hand"] button').evaluateAll(bs => bs.map(b => b.getAttribute("aria-label")));
const hostText = await host.content();
console.log("mia hand", miaCards.length, "leak?", miaCards.some(c => hostText.includes(c.split(",")[0])));
// someone takes a turn: find whose turn
for (const p of players) {
  const txt = await p.getByRole("status").first().innerText();
  if (/Your turn/.test(txt)) { await p.getByRole("button", { name: "Draw" }).click(); await p.waitForTimeout(500); await p.screenshot({ path: SP + "/06-after-draw.png", fullPage: true }); console.log("drew"); }
}
await browser.close();
