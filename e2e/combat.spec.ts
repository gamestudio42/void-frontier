import { expect, test } from '@playwright/test';

interface DevBody {
  position: { x: number; y: number };
  previousPosition: { x: number; y: number };
  velocity: { x: number; y: number };
  angle: number;
  previousAngle: number;
}
interface DevGame {
  sim: { playerId: number; world: { bodies: Map<number, DevBody>; pilots: Map<number, unknown> }; setCommand(id: number, command: object): void };
}

test('locks the nearest pirate and wears its shield down with the guns', async ({ page }) => {
  await page.goto('/?quality=low');
  await page.getByTestId('tutorial-toggle').uncheck();
  await page.getByTestId('start').click();
  // The game starts docked at Outpost Alpha.
  await page.getByTestId('undock').click();
  await page.mouse.move(0, 0);
  await page.keyboard.press('v'); // fly by keyboard: the nose stays where we put it
  await page.evaluate(() => {
    const game = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    const world = game.sim.world;
    const pirateId = [...world.pilots.keys()][0];
    const pirate = world.bodies.get(pirateId)!;
    // A drifting target with its pilot switched off: this test is about locking and hitting, not dogfighting.
    for (const id of [...world.pilots.keys()]) {
      world.pilots.delete(id);
      game.sim.setCommand(id, {});
    }
    pirate.velocity = { x: 0, y: 0 };
    const me = world.bodies.get(game.sim.playerId)!;
    me.position = { x: pirate.position.x - 180, y: pirate.position.y };
    me.previousPosition = { ...me.position };
    me.velocity = { x: 0, y: 0 };
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
