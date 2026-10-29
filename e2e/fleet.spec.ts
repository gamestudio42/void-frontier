import { expect, test } from '@playwright/test';

test('hires a pilot, sends a wingman out with the player and sees it in the fleet panel', async ({ page }) => {
  test.slow();
  await page.goto('/?quality=low');
  await page.getByTestId('tutorial-toggle').uncheck();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('station')).toBeVisible();
  await page.evaluate(() => {
    const game = (window as unknown as { voidFrontier: { sim: { world: { credits: number } }; publish(): void } }).voidFrontier;
    game.sim.world.credits = 20_000;
    game.publish();
  });
  await page.getByTestId('tab-shipyard').click();
  await page.getByTestId('buy-kestrel').getByRole('button').click();

  await page.getByTestId('tab-crew').click();
  await page.locator('[data-testid^=hire-]').first().click();
  await expect(page.getByTestId('pilot-waiting')).toHaveCount(1);
  await page.getByTestId('assign-kestrel').click();
  await expect(page.getByTestId('payroll')).toContainText('1/6');

  await page.getByTestId('tab-shipyard').click();
  await page.getByTestId('order-kestrel').selectOption('wingman');
  await page.getByTestId('give-order-kestrel').click();
  await page.getByTestId('undock').click();

  await page.keyboard.press('KeyO');
  await expect(page.getByTestId('fleet-panel')).toBeVisible();
  await expect(page.getByTestId('fleet-kestrel')).toContainText(/Flying with you/);
});
