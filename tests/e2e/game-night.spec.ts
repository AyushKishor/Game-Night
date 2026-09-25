import { expect, test } from "@playwright/test";
import { chooseGame, hostRoom, joinRoom } from "./helpers";

test("invalid and unknown room codes show a useful message", async ({ page }) => {
  await page.goto("/join?code=ZZZZZZ");
  await expect(page.getByRole("heading", { name: "Room not found" })).toBeVisible();
  await page.goto("/join?code=nope");
  await expect(page.getByText(/isn't a valid room code/)).toBeVisible();
});

test("host creates a room, four players join, ready up, play Crazy Eights privately, reconnect, and switch games", async ({
  browser,
}) => {
  const { page: host, code } = await hostRoom(browser, "Ayush");
  await expect(host.getByLabel(/Room code:/).first()).toBeVisible();

  const players = [];
  for (const name of ["Mia", "Leo", "Zara"]) players.push(await joinRoom(browser, code, name));
  for (const name of ["Mia", "Leo", "Zara"]) await expect(host.getByText(name, { exact: true }).first()).toBeVisible();

  // Duplicate names are de-duplicated
  const dup = await joinRoom(browser, code, "Mia");
  await expect(host.getByText("Mia 2", { exact: true }).first()).toBeVisible();
  await dup.getByRole("button", { name: "Leave room" }).click();
  await dup.getByRole("button", { name: "Leave room" }).last().click();

  await chooseGame(host, "Crazy Eights");
  const start = host.getByRole("button", { name: /Start Crazy Eights/ });
  await expect(start).toBeDisabled();
  for (const p of players) await p.getByRole("button", { name: "I'm ready" }).click();
  await expect(start).toBeEnabled();
  await start.click();

  // Each phone shows its own hand; the table shows no hands.
  const mia = players[0]!;
  const hand = mia.getByRole("region", { name: "Your hand" });
  await expect(hand).toBeVisible();
  const miaCards = await hand
    .getByRole("button")
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")!.split(",")[0]!));
  expect(miaCards.length).toBe(5);
  const tableHtml = await host.content();
  const leoHtml = await players[1]!.content();
  for (const c of miaCards) {
    expect(tableHtml).not.toContain(c);
    expect(leoHtml).not.toContain(c);
  }

  // Reconnect after refresh keeps the same hand.
  await mia.reload();
  await expect(mia.getByRole("region", { name: "Your hand" })).toBeVisible();
  const after = await mia
    .getByRole("region", { name: "Your hand" })
    .getByRole("button")
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")!.split(",")[0]!));
  expect(after.sort()).toEqual(miaCards.sort());

  // Host ends the game, switches to Majority Rules and plays a full round from phones.
  await host.getByRole("button", { name: "End game" }).click();
  await host.getByRole("dialog").getByRole("button", { name: "End game" }).click();
  await chooseGame(host, "Majority Rules");
  await host.getByRole("radio", { name: "Quick Game" }).click();
  for (const p of players) await p.getByRole("button", { name: "I'm ready" }).click();
  await host.getByRole("button", { name: /Start Majority Rules/ }).click();
  await host.getByRole("tab", { name: /My hand|Me/ }).click();
  for (const p of [host, ...players]) {
    const option = p.getByRole("group").getByRole("button").first();
    await option.click();
  }
  await expect(host.getByText(/The majority chose|It's a tie/).first()).toBeVisible();
});

test.setTimeout(120_000);

test("a full game against bots finishes, awards leaderboard points and offers rematch", async ({ browser }) => {
  const { page: host } = await hostRoom(browser, "Solo");
  await host.getByRole("button", { name: "Add bot" }).click();
  await host.getByRole("button", { name: "Add bot" }).click();
  await chooseGame(host, "War");
  await host.getByRole("radio", { name: "Quick Game" }).click();
  await host.getByRole("button", { name: /Start War/ }).click();
  await host.getByRole("tab", { name: /My hand/ }).click();
  const flip = host.getByRole("button", { name: /Flip!|Waiting for others/ });
  for (let i = 0; i < 80; i++) {
    if (
      await host
        .getByRole("heading", { name: /wins!|tie between/ })
        .isVisible()
        .catch(() => false)
    )
      break;
    if (await flip.isEnabled().catch(() => false)) await flip.click().catch(() => {});
    await host.waitForTimeout(250);
  }
  await expect(host.getByRole("heading", { name: /wins!|tie between/ })).toBeVisible({ timeout: 30_000 });
  await expect(host.getByRole("table", { name: /leaderboard/i }).first()).toBeVisible();
  await host.getByRole("button", { name: "Play again" }).click();
  await expect(host.getByRole("heading", { name: "War" })).toBeVisible();
});

test("host transfer: when the host leaves, another player becomes host", async ({ browser }) => {
  const { page: host, code } = await hostRoom(browser, "Boss");
  const p = await joinRoom(browser, code, "Next");
  await host.getByRole("button", { name: "Leave room" }).click();
  await host.getByRole("button", { name: "Leave room" }).last().click();
  await expect(p.getByRole("button", { name: "Add bot" })).toBeVisible({ timeout: 15_000 });
});
