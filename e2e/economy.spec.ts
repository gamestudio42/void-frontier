import { expect, test } from '@playwright/test';

interface DevGame {
  sim: { world: { tick: number }; economy: { nextEventTick: number; traders: { route: string; departTick: number; shipId: number | null }[] } };
}

test('sends a hauler out of the dock and keeps the map available', async ({ page }) => {
  await page.goto('/?quality=low');
  await page.getByTestId('tutorial-toggle').uncheck();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('station')).toBeVisible();
  await page.evaluate(() => {
    const game = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    game.sim.economy.nextEventTick = game.sim.world.tick + 2;
    game.sim.economy.traders.find((t) => t.route === 'outpost_ore_run')!.departTick = game.sim.world.tick + 2;
  });
  await page.getByTestId('undock').click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { voidFrontier: DevGame }).voidFrontier.sim.economy.traders.find((t) => t.route === 'outpost_ore_run')!.shipId !== null), { timeout: 20_000 })
    .toBe(true);
  await page.keyboard.press('m');
  await expect(page.getByTestId('map')).toBeVisible();
});
