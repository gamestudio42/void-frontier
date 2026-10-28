import { expect, test } from '@playwright/test';

interface DevGame {
  sim: {
    playerId: number;
    world: {
      ships: Map<number, { cargo: Map<string, number> }>;
      bodies: Map<number, { position: { x: number; y: number }; previousPosition: { x: number; y: number }; velocity: { x: number; y: number }; angle: number; previousAngle: number }>;
    };
  };
  publish(): void;
}

const credits = async (page: import('@playwright/test').Page) => Number(await page.getByTestId('credits').getAttribute('data-value'));

test('starts docked, sells ore, buys an upgrade, undocks and docks again', async ({ page }) => {
  await page.goto('/?quality=low');
  await page.getByTestId('tutorial-toggle').uncheck();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('station')).toBeVisible();
  const start = await credits(page);

  await page.evaluate(() => {
    const game = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    game.sim.world.ships.get(game.sim.playerId)!.cargo.set('titanium_ore', 40);
    game.publish();
  });
  await page.getByTestId('tab-market').click();
  await page.getByTestId('sell-all-titanium_ore').click();
  await expect.poll(() => credits(page)).toBeGreaterThan(start + 500);

  await page.getByTestId('tab-upgrades').click();
  await page.getByTestId('upgrade-cargo_frame').getByRole('button').click();
  await expect(page.getByTestId('remove-cargo_frame')).toBeVisible();

  await page.getByTestId('undock').click();
  await expect(page.getByTestId('station')).toBeHidden();

  // Put the ship back in the bay, slow and aligned, and ask to dock.
  await page.evaluate(() => {
    const game = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    const body = game.sim.world.bodies.get(game.sim.playerId)!;
    body.position = { x: 200, y: 0 };
    body.previousPosition = { ...body.position };
    body.velocity = { x: 0, y: 0 };
    body.angle = Math.PI;
    body.previousAngle = Math.PI;
  });
  await expect(page.getByTestId('docking')).toHaveClass(/ready/, { timeout: 20_000 });
  await page.keyboard.press('f');
  await expect(page.getByTestId('station')).toBeVisible();
});
