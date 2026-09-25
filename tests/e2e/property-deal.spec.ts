import { expect, test } from "@playwright/test";
import { chooseGame, hostRoom, joinRoom } from "./helpers";

test("Property Deal: phones see their own hand, bank a card, play a property and end the turn", async ({ browser }) => {
  const { page: host, code } = await hostRoom(browser, "Ayush");
  const mia = await joinRoom(browser, code, "Mia");
  await expect(host.getByText("Mia", { exact: true }).first()).toBeVisible();
  await chooseGame(host, "Property Deal");
  await mia.getByRole("button", { name: "I'm ready" }).click();
  await host.getByRole("button", { name: /Start Property Deal/ }).click();

  // The TV shows both tables and never a hand.
  await expect(host.getByRole("region", { name: "Mia's table" })).toBeVisible();
  const miaHand = mia.getByRole("region", { name: "Your hand" });
  await expect(miaHand).toBeVisible();
  const labels = await miaHand.getByRole("img").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")!));
  expect(labels.length).toBe(5);

  // Host goes first: play something, then end the turn.
  await host.getByRole("tab", { name: /My hand/ }).click();
  const hostHand = host.getByRole("region", { name: "Your hand" });
  await expect(hostHand.getByRole("button")).toHaveCount(7);
  const first = hostHand.getByRole("button").first();
  await first.click();
  const choice = host
    .getByRole("button", { name: /^(Bank it|(Brown|Light Blue|Pink|Orange|Red|Yellow|Green|Dark Blue|Railroad|Utility) \(\d)/ })
    .first();
  await choice.click();
  await expect(host.getByText(/2 plays left/)).toBeVisible();
  await host.getByRole("button", { name: /^End turn/ }).click();
  const discard = host.getByRole("button", { name: "Discard & end turn" });
  if (await discard.isVisible().catch(() => false)) {
    await hostHand.getByRole("button").first().click();
    await discard.click();
  }

  // Now Mia's phone lights up.
  await expect(mia.getByText(/Your turn — 3 plays left/)).toBeVisible();
  await expect(miaHand.getByRole("button")).toHaveCount(7);
  await mia.screenshot({ path: "test-results/property-deal-phone.png", fullPage: true });
  await host.getByRole("tab", { name: /Table/ }).click();
  await host.screenshot({ path: "test-results/property-deal-tv.png", fullPage: true });
});
