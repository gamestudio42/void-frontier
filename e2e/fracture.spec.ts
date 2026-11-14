import { expect, test } from '@playwright/test';

interface DevBody {
  position: { x: number; y: number };
  previousPosition: { x: number; y: number };
  velocity: { x: number; y: number };
  angle: number;
  previousAngle: number;
}
interface DevGame {
  sim: { playerId: number; world: { bodies: Map<number, DevBody>; asteroids: Map<number, { radius: number; fragment?: boolean }>; destroyEntity(id: number): void } };
}

test.setTimeout(150_000);

test('the scanner shows the vein, the laser heats the rock and too much heat cracks it', async ({ page }) => {
  await page.goto('/?quality=low');
  await page.getByTestId('tutorial-toggle').uncheck();
  await page.getByTestId('start').click();
  await page.getByTestId('undock').click();
  await page.mouse.move(0, 0);
  // A mid-sized rock held still, the ship 40 m off its surface facing it (+X, the screen's right).
  await page.evaluate(() => {
    const game = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    const world = game.sim.world;
    const [rockId, rock] = [...world.asteroids.entries()].find(([, a]) => a.radius > 14 && a.radius < 22)!;
    const body = world.bodies.get(rockId)! as DevBody & { angularVelocity: number };
    body.velocity = { x: 0, y: 0 };
    body.angularVelocity = 0;
    // Clear the neighbours, so drifting pebbles do not cross the beam.
    for (const [id] of [...world.asteroids.entries()]) {
      const q = world.bodies.get(id)!.position;
      if (id !== rockId && Math.hypot(q.x - body.position.x, q.y - body.position.y) < 400) world.destroyEntity(id);
    }
    const me = world.bodies.get(game.sim.playerId)!;
    me.position = { x: body.position.x - rock.radius - 40, y: body.position.y };
    me.previousPosition = { ...me.position };
    me.velocity = { x: 0, y: 0 };
    me.angle = 0;
    me.previousAngle = 0;
  });
  // Mouse steering turns the nose onto the cursor: put the cursor on the rock, as a player would.
  await page.waitForTimeout(300);
  const spot = await page.evaluate(() => {
    const game = (window as unknown as { voidFrontier: DevGame & { renderer: { worldToScreen(p: { x: number; y: number }, w: number, h: number): { x: number; y: number } } } }).voidFrontier;
    const world = game.sim.world;
    const me = world.bodies.get(game.sim.playerId)!.position;
    const canvas = document.querySelector('canvas')!;
    return game.renderer.worldToScreen({ x: me.x + 60, y: me.y }, canvas.clientWidth, canvas.clientHeight);
  });
  await page.mouse.move(spot.x, spot.y);
  await page.keyboard.down('x');
  const heat = page.getByTestId('rock-heat');
  await expect(heat).toBeVisible({ timeout: 20_000 });
  // Unscanned, the vein is unknown; a scan reads it.
  await expect(heat).toHaveAttribute('data-vein', 'unknown');
  await page.keyboard.press('r');
  await expect(heat).not.toHaveAttribute('data-vein', 'unknown');
  await expect(heat).toHaveAttribute('data-zone', 'sweet', { timeout: 40_000 });
  await page.screenshot({ path: 'test-results/fracture-sweet.png' });
  // Holding on past the sweet spot cracks the rock into fragments.
  const fragments = () =>
    page.evaluate(() => [...(window as unknown as { voidFrontier: DevGame }).voidFrontier.sim.world.asteroids.values()].filter((a) => a.fragment).length);
  await expect.poll(fragments, { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
  await page.keyboard.up('x');
  await page.screenshot({ path: 'test-results/fracture-cracked.png' });
});
