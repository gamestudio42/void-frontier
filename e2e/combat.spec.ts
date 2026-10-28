import { expect, test } from '@playwright/test';

interface DevBody {
  position: { x: number; y: number };
  previousPosition: { x: number; y: number };
  velocity: { x: number; y: number };
  angle: number;
  previousAngle: number;
}
interface DevGame {
  sim: { playerId: number; world: { bodies: Map<number, DevBody>; pilots: Map<number, unknown> } };
}

test('locks the nearest pirate and wears its shield down with the guns', async ({ page }) => {
  await page.goto('/?quality=low');
  await page.getByTestId('start').click();
  await page.mouse.move(0, 0);
  await page.keyboard.press('v'); // fly by keyboard: the nose stays where we put it
  await page.evaluate(() => {
    const game = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    const world = game.sim.world;
    const pirate = world.bodies.get([...world.pilots.keys()][0])!;
    const me = world.bodies.get(game.sim.playerId)!;
    me.position = { x: pirate.position.x - 180, y: pirate.position.y };
    me.previousPosition = { ...me.position };
    me.velocity = { ...pirate.velocity };
    me.angle = 0;
    me.previousAngle = 0;
  });
  const target = page.getByTestId('target');
  await expect(target).toBeVisible({ timeout: 20_000 });
  const before = Number(await target.getAttribute('data-shield'));
  await page.keyboard.down('Control');
  await expect.poll(async () => Number(await target.getAttribute('data-shield')), { timeout: 40_000 }).toBeLessThan(before);
  await page.keyboard.up('Control');
});
