import { expect, test, type Page } from '@playwright/test';

type Body = { position: { x: number; y: number }; previousPosition: { x: number; y: number }; velocity: { x: number; y: number } };
type DevShip = { faction: string; destroyed: boolean; shield: number; upgrades: string[]; docked: number | null };
type DevGame = {
  publish(): void;
  renderer: { scene: { getObjectByName(name: string): unknown } };
  sim: {
    playerId: number;
    world: {
      credits: number;
      ships: Map<number, DevShip>;
      bodies: Map<number, Body>;
      stations: Map<number, { definition: { upgrades: string[] } }>;
    };
  };
};

const game = (page: Page) => page.evaluate(() => Boolean((window as unknown as { voidFrontier?: DevGame }).voidFrontier));
const speed = (page: Page) =>
  page.evaluate(() => {
    const g = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    const v = g.sim.world.bodies.get(g.sim.playerId)!.velocity;
    return Math.hypot(v.x, v.y);
  });

test('a module gives a verb: buy the afterburner, dash on 1, trade it up to Mk II, and an EMP jams a pirate', async ({ page }) => {
  await page.goto('/?quality=low');
  await page.getByTestId('tutorial-toggle').uncheck();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('station')).toBeVisible();
  await expect.poll(() => game(page)).toBe(true);

  // Outpost Alpha sells the Mk I; for the test it also stocks the Mk II.
  await page.evaluate(() => {
    const g = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    g.sim.world.credits = 20_000;
    const ship = g.sim.world.ships.get(g.sim.playerId)!;
    g.sim.world.stations.get(ship.docked!)!.definition.upgrades.push('afterburner_mk2');
    g.publish();
  });
  await page.getByTestId('tab-upgrades').click();
  await expect(page.getByTestId('upgrade-afterburner_mk2')).toContainText('Fit first');
  await expect(page.getByTestId('buy-afterburner_mk2')).toBeDisabled();
  await page.getByTestId('buy-afterburner').click();
  await expect(page.getByTestId('remove-afterburner')).toBeVisible();
  await expect(page.getByTestId('tier-afterburner')).toHaveText('Mk I');

  await page.getByTestId('undock').click();
  await expect(page.getByTestId('station')).toBeHidden();
  const dash = page.getByTestId('verb-dash');
  await expect(dash).toHaveAttribute('data-ready', 'yes', { timeout: 10_000 });
  // The burner cans are on the hull.
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { voidFrontier: DevGame }).voidFrontier.renderer.scene.getObjectByName('module-kit')))).toBe(true);

  // 1 kicks the ship up by the dash's 45 m/s at once, then the verb recharges.
  const before = await speed(page);
  await page.keyboard.press('1');
  await expect.poll(() => speed(page)).toBeGreaterThan(before + 35);
  await expect(dash).toHaveAttribute('data-block', 'cooldown');
  await page.screenshot({ path: 'test-results/modules-dash.png' });

  // Back in the bay, slow and aligned (as the station test docks), the Mk II goes in over the Mk I.
  await page.evaluate(() => {
    const g = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    const body = g.sim.world.bodies.get(g.sim.playerId)! as Body & { angle: number; previousAngle: number };
    body.position = { x: 200, y: 0 };
    body.previousPosition = { ...body.position };
    body.velocity = { x: 0, y: 0 };
    body.angle = Math.PI;
    body.previousAngle = Math.PI;
  });
  await expect(page.getByTestId('docking')).toHaveClass(/ready/, { timeout: 20_000 });
  await page.keyboard.press('f');
  await expect(page.getByTestId('station')).toBeVisible();
  await page.getByTestId('tab-upgrades').click();
  await expect(page.getByTestId('upgrade-afterburner_mk2')).toContainText('Trades in');
  await page.getByTestId('buy-afterburner_mk2').click();
  await expect(page.getByTestId('remove-afterburner_mk2')).toBeVisible();
  await expect(page.getByTestId('upgrade-afterburner')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/modules-outfitting.png' });
  await page.getByTestId('undock').click();
  await expect(page.getByTestId('verb-dash')).toContainText('Mk II', { timeout: 10_000 });

  // An EMP projector, a pirate alongside: 3 strips its shield and jams its guns.
  await page.mouse.move(640, 200);
  const pirate = await page.evaluate(() => {
    const g = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    g.sim.world.ships.get(g.sim.playerId)!.upgrades.push('emp_projector');
    const me = g.sim.world.bodies.get(g.sim.playerId)!;
    const [id] = [...g.sim.world.ships.entries()].find(([, s]) => s.faction === 'pirate' && !s.destroyed)!;
    const body = g.sim.world.bodies.get(id)!;
    body.position = { x: me.position.x + 180, y: me.position.y };
    body.previousPosition = { ...body.position };
    body.velocity = { ...me.velocity };
    return id;
  });
  await expect(page.getByTestId('verb-emp')).toHaveAttribute('data-ready', 'yes', { timeout: 10_000 });
  const shield = await page.evaluate((id) => (window as unknown as { voidFrontier: DevGame }).voidFrontier.sim.world.ships.get(id)!.shield, pirate);
  await page.keyboard.press('3');
  await expect.poll(() => page.evaluate((id) => (window as unknown as { voidFrontier: DevGame }).voidFrontier.sim.world.ships.get(id)!.shield, pirate)).toBeLessThan(shield - 100);
  await expect(page.getByTestId('target-jammed')).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: 'test-results/modules-emp.png' });
});
