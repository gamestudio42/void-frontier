import { expect, test } from "@playwright/test";

type DevGame = { sim: { world: { tick: number; events: unknown[] } } };
const tick = (page: import("@playwright/test").Page) =>
  page.evaluate(
    () =>
      (window as unknown as { voidFrontier: DevGame }).voidFrontier.sim.world
        .tick,
  );

test("photo mode pauses the game, hides the HUD and saves a picture", async ({
  page,
}) => {
  await page.goto("/?quality=low");
  await page.getByTestId("tutorial-toggle").uncheck();
  await page.getByTestId("start").click();
  await page.getByTestId("undock").click();
  await expect(page.getByTestId("speed")).toBeVisible();

  await page.keyboard.press("F9");
  await expect(page.getByTestId("photo-mode")).toContainText("Photo mode");
  await expect(page.getByTestId("speed")).toBeHidden();
  const frozen = await tick(page);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(500);
  await page.keyboard.up("KeyW");
  expect(await tick(page)).toBe(frozen);

  const download = page.waitForEvent("download");
  await page.keyboard.press("Enter");
  expect((await download).suggestedFilename()).toMatch(
    /^void-frontier-.*\.png$/,
  );

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("photo-mode")).toHaveCount(0);
  await expect(page.getByTestId("speed")).toBeVisible();
  await expect.poll(() => tick(page)).toBeGreaterThan(frozen);
});

test("colour-blind correction filters the screen, and the radio can be turned off", async ({
  page,
}) => {
  await page.goto("/?quality=low");
  await page.getByTestId("tutorial-toggle").uncheck();
  await page.getByTestId("start").click();
  await page.getByTestId("undock").click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByTestId("color-vision").selectOption("deuteranopia");
  const app = page.locator(".app");
  await expect(app).toHaveAttribute("data-color-vision", "deuteranopia");
  expect(await app.evaluate((el) => getComputedStyle(el).filter)).toContain(
    "cvd-deuteranopia",
  );
  await page.getByTestId("radio-toggle").uncheck();
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByTestId("resume").click();
  await expect(page.getByTestId("pause")).toHaveCount(0);
  await page.evaluate(() => {
    const game = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    game.sim.world.events.push({
      type: "rank",
      rank: 1,
      id: "licensed",
      credits: 500,
    });
  });
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("radio")).toHaveCount(0);
});
