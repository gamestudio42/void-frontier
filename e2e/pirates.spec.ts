import { expect, test, type Page } from '@playwright/test';

type Body = { position: { x: number; y: number }; previousPosition: { x: number; y: number }; velocity: { x: number; y: number } };
type DevShip = { faction: string; destroyed: boolean; surrendered?: boolean; shield: number };
type DevGame = {
  sim: { playerId: number; world: { credits: number; ships: Map<number, DevShip>; bodies: Map<number, Body>; pilots: Map<number, { mode: string; target: number | null }> } };
};

/** Moves the nearest living pirate `distance` metres east of the player, at rest; returns its id. */
const bringPirate = (page: Page, distance: number) =>
  page.evaluate((distance) => {
    const game = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    const world = game.sim.world;
    const me = world.bodies.get(game.sim.playerId)!;
    const [id] = [...world.ships.entries()].find(([, s]) => s.faction === 'pirate' && !s.destroyed)!;
    const body = world.bodies.get(id)!;
    body.position = { x: me.position.x + distance, y: me.position.y };
    body.previousPosition = { ...body.position };
    body.velocity = { ...me.velocity };
    return id;
  }, distance);

test('the target panel names the pirate pilot, and a crew that surrenders can be boarded for a ransom', async ({ page }) => {
  await page.goto('/?quality=low');
  await page.getByTestId('tutorial-toggle').uncheck();
  await page.getByTestId('start').click();
  await page.getByTestId('undock').click();
  await page.mouse.move(640, 200);

  // A pirate close by is locked at once: its panel says how it fights and that it is steady.
  await bringPirate(page, 400);
  const pilot = page.getByTestId('target-pilot');
  await expect(pilot).toContainText('Skirmisher', { timeout: 10_000 });
  await expect(pilot).toHaveAttribute('data-nerve', 'steady');

  // Its crew gives up (as the morale system does when it breaks); it stops being a target.
  const id = await bringPirate(page, 160);
  await page.evaluate((id) => {
    const game = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    const ship = game.sim.world.ships.get(id)!;
    ship.surrendered = true;
    const crew = game.sim.world.pilots.get(id)!;
    crew.mode = 'surrendered';
    crew.target = null;
  }, id);
  const boarding = page.getByTestId('boarding');
  await expect(boarding).toContainText('Surrendered ship');
  await expect(page.getByTestId('target')).toBeHidden();

  // Alongside and matched: F boards it, and the crew pays more than a strongbox.
  await bringPirate(page, 50);
  await expect(boarding).toContainText('ransom');
  const before = await page.evaluate(() => (window as unknown as { voidFrontier: DevGame }).voidFrontier.sim.world.credits);
  await page.screenshot({ path: 'test-results/pirates-surrendered.png' });
  await page.keyboard.press('f');
  await expect.poll(() => page.evaluate(() => (window as unknown as { voidFrontier: DevGame }).voidFrontier.sim.world.credits)).toBeGreaterThan(before + 250);
});
