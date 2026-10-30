import { expect, test } from '@playwright/test';

test('refits a weapon at the station and sees it on the HUD', async ({ page }) => {
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
  await page.getByTestId('tab-upgrades').click();
  await page.getByTestId('fit-0-gatling_mk1').click();
  await expect(page.getByTestId('mount-0')).toContainText('Gatling');
  await page.getByTestId('undock').click();
  await expect(page.locator('body')).toContainText('Gatling');
});

test('moves a key in the settings and flies with it', async ({ page }) => {
  test.slow();
  await page.goto('/?quality=low');
  await page.getByRole('button', { name: /settings/i }).first().click();
  await page.getByTestId('key-bindings').locator('summary').click();
  await page.getByTestId('bind-map').click();
  await page.keyboard.press('KeyL');
  await expect(page.getByTestId('bind-map')).toHaveText('L');
  await page.reload();
  await page.getByTestId('tutorial-toggle').uncheck();
  await page.getByTestId('start').click();
  await page.getByTestId('undock').click();
  await page.keyboard.press('KeyL');
  await expect(page.getByTestId('map')).toBeVisible();
});

test('asks for the verdict on Kess Varo and follows the choice', async ({ page }) => {
  test.slow();
  await page.goto('/?quality=low');
  await page.getByTestId('tutorial-toggle').uncheck();
  await page.getByTestId('start').click();
  await page.getByTestId('undock').click();
  await page.evaluate(() => {
    const game = (window as unknown as { voidFrontier: { sim: { campaign: { step: number } } } }).voidFrontier;
    game.sim.campaign.step = 11;
  });
  await page.getByTestId('choice-justice').click();
  await expect(page.getByTestId('campaign')).toContainText('The last of them');
});
