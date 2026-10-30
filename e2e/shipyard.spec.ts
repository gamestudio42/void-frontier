import { expect, test } from '@playwright/test';

test('buys a Prospector at the shipyard and flies it out', async ({ page }) => {
  await page.goto('/?quality=low');
  await page.getByTestId('tutorial-toggle').uncheck();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('station')).toBeVisible();
  await page.evaluate(() => {
    const game = (window as unknown as { voidFrontier: { sim: { world: { credits: number } }; publish(): void } }).voidFrontier;
    game.sim.world.credits = 40_000;
    game.publish();
  });
  await page.getByTestId('tab-shipyard').click();
  await page.getByTestId('buy-prospector').getByRole('button').click();
  await page.getByTestId('board-prospector').click();
  await page.getByTestId('undock').click();
  await expect(page.getByTestId('sector')).toContainText(/Prospector/);
});
