import { expect, test } from "@playwright/test";
import { chooseGame, hostRoom, joinRoom } from "./helpers";

const GAMES = [
  { name: "Colour Clash", phone: /Your hand/ },
  { name: "Power Grab", phone: /Your cards/ },
  { name: "Code Words", phone: /Board/ },
  { name: "Texas Hold'em", phone: /Your hand/ },
  { name: "Tycoon", phone: /Your properties/ },
];

test("the classic games start with bots and show the right screens on phone and TV", async ({ browser }) => {
  test.setTimeout(120_000);
  const { page: host, code } = await hostRoom(browser, "Ayush");
  const mia = await joinRoom(browser, code, "Mia");
  await expect(host.getByText("Mia", { exact: true }).first()).toBeVisible();
  for (let i = 0; i < 2; i++) await host.getByRole("button", { name: "Add bot" }).click();
  await mia.getByRole("button", { name: "I'm ready" }).click();

  for (const g of GAMES) {
    await chooseGame(host, g.name);
    await host.getByRole("button", { name: new RegExp(`Start ${g.name}`) }).click();
    await expect(host.getByRole("heading", { name: g.name })).toBeVisible();
    await expect(mia.getByRole(g.name === "Code Words" ? "grid" : "region", { name: g.phone })).toBeVisible();
    const slug = g.name.toLowerCase().replace(/[^a-z]+/g, "-");
    await mia.waitForTimeout(1500);
    await mia.screenshot({ path: `test-results/${slug}-phone.png`, fullPage: true });
    await host.screenshot({ path: `test-results/${slug}-tv.png`, fullPage: true });
    await host.getByRole("button", { name: "End game" }).click();
    await host.getByRole("dialog").getByRole("button", { name: "End game" }).click();
    const ready = mia.getByRole("button", { name: "I'm ready" });
    if (await ready.isVisible().catch(() => false)) await ready.click();
  }
});
