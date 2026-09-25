import { expect, test } from "@playwright/test";
import { chooseGame, hostRoom, joinRoom } from "./helpers";

test("Tycoon: roll, buy or pass, and end the turn from a phone", async ({ browser }) => {
  const { page: host, code } = await hostRoom(browser, "Ayush");
  const mia = await joinRoom(browser, code, "Mia");
  await expect(host.getByText("Mia", { exact: true }).first()).toBeVisible();
  await chooseGame(host, "Tycoon");
  await mia.getByRole("button", { name: "I'm ready" }).click();
  await host.getByRole("button", { name: /Start Tycoon/ }).click();

  await host.getByRole("tab", { name: /My hand/ }).click();
  await host.getByRole("button", { name: "Roll" }).click();
  const buy = host.getByRole("button", { name: /^Buy for/ });
  const end = host.getByRole("button", { name: "End turn" });
  const roll = host.getByRole("button", { name: "Roll" });
  // Doubles let you roll again; keep going until the turn can end.
  for (let i = 0; i < 40 && !(await end.isVisible()); i++) {
    if (await buy.isEnabled({ timeout: 500 }).catch(() => false)) await buy.click({ timeout: 2000 }).catch(() => {});
    else if (await roll.isVisible()) await roll.click({ timeout: 2000 }).catch(() => {});
    else await host.waitForTimeout(250);
  }
  await end.click();
  await expect(mia.getByText("Your turn — roll!")).toBeVisible();
  await mia.getByRole("button", { name: "Roll" }).click();
  await expect(mia.getByText(/rolled/).first()).toBeVisible();
});
