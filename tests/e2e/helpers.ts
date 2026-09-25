import { type Browser, type Page, expect } from "@playwright/test";

export async function hostRoom(browser: Browser, name = "Host") {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("/host");
  await page.getByLabel("Your display name").fill(name);
  await page.getByRole("button", { name: "Create room" }).click();
  await page.waitForURL(/\/room\/[A-Z0-9]{6}$/);
  const code = page.url().split("/room/")[1]!;
  return { page, code };
}

export async function joinRoom(browser: Browser, code: string, name: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`/r/${code}`);
  await page.getByLabel("Nickname").fill(name);
  await page.getByRole("button", { name: "Join the game" }).click();
  await page.waitForURL(/\/room\//);
  return page;
}

export async function chooseGame(host: Page, name: string) {
  const change = host.getByRole("button", { name: "Change game" });
  if (await change.isVisible().catch(() => false)) await change.click();
  await host
    .locator("li", { hasText: name })
    .first()
    .getByRole("button", { name: /^(Choose|Selected)$/ })
    .click();
  await expect(host.getByRole("button", { name: new RegExp(`Start ${name}`) })).toBeVisible();
}
