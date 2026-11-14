import { expect, test, type Page } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

type Ship = { faction: string; destroyed: boolean };
type Body = { position: { x: number; y: number }; previousPosition: { x: number; y: number }; velocity: { x: number; y: number }; angle: number; previousAngle: number };
type Handle = {
  voidFrontier: {
    tutorialStep: number | null;
    beginTutorialStep(): void;
    sim: { playerId: number; world: { ships: Map<number, Ship>; bodies: Map<number, Body>; pilots: Map<number, { target: number | null }> } };
  };
};

/** Pirates alive in the sector, with their distance to the player and whether they hunt it. */
const pirates = (page: Page) =>
  page.evaluate(() => {
    const { sim } = (window as unknown as Handle).voidFrontier;
    const me = sim.world.bodies.get(sim.playerId)!.position;
    return [...sim.world.ships.entries()]
      .filter(([, s]) => s.faction === 'pirate' && !s.destroyed)
      .map(([id]) => {
        const p = sim.world.bodies.get(id)!.position;
        return { distance: Math.hypot(p.x - me.x, p.y - me.y), hunting: sim.world.pilots.get(id)?.target === sim.playerId };
      });
  });

async function startSortie(page: Page) {
  await page.goto('/?quality=low');
  await page.getByTestId('start').click();
  await expect(page.getByTestId('launch')).toBeHidden({ timeout: 10_000 });
}

test('the first sortie is a quiet pocket until the fight lesson sends one pirate', async ({ page }) => {
  await startSortie(page);
  expect(await pirates(page)).toEqual([]);
  await page.evaluate(() => {
    const game = (window as unknown as Handle).voidFrontier;
    game.tutorialStep = 11; // fight
    game.beginTutorialStep();
  });
  await expect(page.getByTestId('tutorial')).toContainText('12/13');
  await expect.poll(() => pirates(page)).toHaveLength(1);
  const [sparring] = await pirates(page);
  expect(sparring.hunting).toBe(true);
  expect(sparring.distance).toBeLessThan(900);
  await page.screenshot({ path: 'test-results/first-sortie-fight.png' });
});

test('a tip says to brake when the ship is closing fast on the station', async ({ page }) => {
  await startSortie(page);
  await page.getByTestId('tutorial').getByRole('button').click(); // skip the lessons
  await page.evaluate(() => {
    const { sim } = (window as unknown as Handle).voidFrontier;
    const body = sim.world.bodies.get(sim.playerId)!;
    // 400 m out, heading for the station at 120 m/s.
    body.position = { x: 900, y: 0 };
    body.previousPosition = { ...body.position };
    body.velocity = { x: -120, y: 0 };
    body.angle = Math.PI;
    body.previousAngle = Math.PI;
  });
  const tip = page.getByTestId('tip');
  await expect(tip).toHaveAttribute('data-tip', 'tip.brake', { timeout: 5_000 });
  await page.screenshot({ path: 'test-results/first-sortie-tip.png' });
  await page.keyboard.down('Space');
  await expect(tip).toBeHidden();
  await page.keyboard.up('Space');
});
