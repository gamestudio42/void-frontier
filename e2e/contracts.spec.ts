import { expect, test } from '@playwright/test';

interface Contract {
  id: number;
  delivery?: { drop?: string; sector: string };
}
interface DevGame {
  sim: {
    playerId: number;
    step(): void;
    world: { bodies: Map<number, { position: { x: number; y: number }; previousPosition: { x: number; y: number }; velocity: { x: number; y: number } }>; credits: number };
    missions: { offers: Record<string, Contract[]>; active: Contract[]; refreshTick: number; drops: { id: string; position: { x: number; y: number } }[] };
  };
  acceptContract(id: number): void;
}

test('takes a delivery contract, flies the crates to the relay and gets paid', async ({ page }) => {
  await page.goto('/?quality=low');
  await page.getByTestId('tutorial-toggle').uncheck();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('station')).toBeVisible();
  // Find (or wait for) a delivery to a relay in this sector, and take it.
  await page.evaluate(() => {
    const game = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    const board = game.sim.missions;
    const local = () => board.offers.outpost_alpha_station;
    const pick = () => local().find((c) => c.delivery?.drop && c.delivery.sector === 'outpost_alpha');
    for (let i = 0; i < 400 && !pick(); i++) {
      local().shift();
      board.refreshTick = 0;
      game.sim.step();
    }
    game.acceptContract(pick()!.id);
  });
  await expect(page.locator('[data-testid^="active-"]')).toHaveCount(1);
  await page.getByTestId('undock').click();
  await expect(page.getByTestId('tracker')).toBeVisible();

  const before = await page.evaluate(() => (window as unknown as { voidFrontier: DevGame }).voidFrontier.sim.world.credits);
  await page.evaluate(() => {
    const game = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    const contract = game.sim.missions.active[0];
    const drop = game.sim.missions.drops.find((d) => d.id === contract.delivery!.drop)!;
    const body = game.sim.world.bodies.get(game.sim.playerId)!;
    body.position = { x: drop.position.x + 20, y: drop.position.y };
    body.previousPosition = { ...body.position };
    body.velocity = { x: 0, y: 0 };
  });
  await expect(page.getByTestId('notice')).toBeVisible({ timeout: 20_000 });
  const after = await page.evaluate(() => (window as unknown as { voidFrontier: DevGame }).voidFrontier.sim.world.credits);
  expect(after).toBeGreaterThan(before);
  await expect(page.getByTestId('tracker')).toBeHidden();
});
