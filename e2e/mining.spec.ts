import { expect, test } from '@playwright/test';

interface DevBody {
  position: { x: number; y: number };
  previousPosition: { x: number; y: number };
  velocity: { x: number; y: number };
  angle: number;
  previousAngle: number;
}
interface DevGame {
  sim: { playerId: number; world: { bodies: Map<number, DevBody>; asteroids: Map<number, { radius: number }> } };
}

test('scans a rock, mines it and fills the hold', async ({ page }) => {
  await page.goto('/?quality=low');
  await page.getByTestId('start').click();
  // The game starts docked at Outpost Alpha.
  await page.getByTestId('undock').click();
  await page.mouse.move(0, 0);
  await page.keyboard.press('v'); // keep the nose where we put it
  await page.evaluate(() => {
    const game = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    const world = game.sim.world;
    const [rockId, rock] = [...world.asteroids.entries()].find(([, a]) => a.radius > 10)!;
    const p = world.bodies.get(rockId)!.position;
    const me = world.bodies.get(game.sim.playerId)!;
    me.position = { x: p.x - rock.radius - 40, y: p.y };
    me.previousPosition = { ...me.position };
    me.velocity = { x: 0, y: 0 };
    me.angle = 0;
    me.previousAngle = 0;
  });
  await page.keyboard.press('r');
  await page.keyboard.down('x');
  await expect(page.getByTestId('mining-target')).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => Number(await page.getByTestId('hold').getAttribute('data-value')), { timeout: 60_000 }).toBeGreaterThan(0);
  await page.keyboard.up('x');
});
