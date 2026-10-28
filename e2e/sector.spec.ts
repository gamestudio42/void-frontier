import { expect, test, type Page } from '@playwright/test';

const value = async (page: Page, id: string) => Number(await page.getByTestId(id).getAttribute('data-value'));

interface DevGame {
  sim: { playerId: number; world: { bodies: Map<number, { velocity: { x: number; y: number } }> } };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?quality=low');
  await page.getByTestId('tutorial-toggle').uncheck();
  await page.getByTestId('start').click();
  // The game starts docked at Outpost Alpha.
  await page.getByTestId('undock').click();
  await page.mouse.move(0, 0);
});

test('shows the hull and the radar at launch', async ({ page }) => {
  expect(await value(page, 'hull')).toBeGreaterThan(0);
  await expect(page.getByTestId('hull')).toHaveText(/100/);
  await expect(page.getByTestId('radar')).toBeVisible();
});

test('a hard crash into the station destroys the ship and R relaunches it', async ({ page }) => {
  // The player starts east of the station facing it; push the ship at it hard.
  await page.evaluate(() => {
    const game = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    game.sim.world.bodies.get(game.sim.playerId)!.velocity.x = -90;
  });
  await expect(page.getByTestId('destroyed')).toBeVisible({ timeout: 30_000 });
  expect(await value(page, 'hull')).toBe(0);
  await page.keyboard.press('r');
  await expect(page.getByTestId('destroyed')).toBeHidden();
  await expect.poll(() => value(page, 'hull')).toBeGreaterThan(999);
});
