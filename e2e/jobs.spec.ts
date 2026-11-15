import { expect, test, type Page } from '@playwright/test';

interface Contract {
  id: number;
  kind: string;
  reward: number;
  client?: string;
  modifier?: string;
  cargo?: { integrity: number; g: number; lastVelocity: unknown; lastTick: number };
  delivery?: { drop?: string; sector: string; units: number };
}
interface DevGame {
  publish(): void;
  sim: {
    playerId: number;
    step(): void;
    world: { bodies: Map<number, { position: { x: number; y: number }; previousPosition: { x: number; y: number }; velocity: { x: number; y: number } }> };
    missions: { offers: Record<string, Contract[]>; active: Contract[]; refreshTick: number; clients: Record<string, number> };
  };
}

const dev = (page: Page) => page.evaluate(() => Boolean((window as unknown as { voidFrontier?: DevGame }).voidFrontier));

/** A sudden 30 m/s change of velocity: the kind of jolt a bump or a dash gives the hold. */
const jolt = (page: Page) =>
  page.evaluate(() => {
    const game = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    const body = game.sim.world.bodies.get(game.sim.playerId)!;
    body.velocity = { x: body.velocity.x + 30, y: body.velocity.y };
  });

test('a named client offers a fragile delivery, and jolts crack the crates until they shatter', async ({ page }) => {
  await page.goto('/?quality=low');
  await page.getByTestId('tutorial-toggle').uncheck();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('station')).toBeVisible();
  await expect.poll(() => dev(page)).toBe(true);

  // A delivery on the home board from Halden Optics, who only ship fragile glass.
  await page.evaluate(() => {
    const game = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    const board = game.sim.missions;
    const local = () => board.offers.outpost_alpha_station;
    const pick = () => local().find((c) => c.delivery?.drop && c.delivery.sector === 'outpost_alpha' && !c.modifier);
    for (let i = 0; i < 400 && !pick(); i++) {
      local().shift();
      board.refreshTick = 0;
      game.sim.step();
    }
    const offer = pick()!;
    offer.client = 'halden_optics';
    offer.modifier = 'fragile';
    offer.cargo = { integrity: 1, g: 0, lastVelocity: null, lastTick: -1 };
    board.clients.halden_optics = 1;
    game.publish();
  });
  await page.getByTestId('tab-contracts').click();
  const card = page.getByTestId('client-halden_optics').first();
  await expect(card).toContainText('Halden Optics');
  await expect(card).toContainText('jobs done: 1');
  await expect(page.getByTestId('modifier-fragile').first()).toContainText('above 2 g');
  await page.screenshot({ path: 'test-results/jobs-offer.png' });
  await page.locator('[data-testid^="offer-delivery"]').filter({ has: page.getByTestId('modifier-fragile') }).getByRole('button').click();
  await expect(page.locator('[data-testid^="active-"]')).toHaveCount(1);

  await page.getByTestId('undock').click();
  const status = page.locator('[data-testid^="cargo-"]').first();
  await expect(status).toContainText('Fragile 100%', { timeout: 10_000 });

  // One jolt costs a share of the crates; the tracker shows what is left.
  await jolt(page);
  await expect.poll(async () => Number(await status.getAttribute('data-integrity'))).toBeLessThan(1);
  await page.screenshot({ path: 'test-results/jobs-strain.png' });

  // Enough of them and the glass is gone, and so is the contract.
  for (let i = 0; i < 4; i++) {
    if ((await page.locator('[data-testid^="cargo-"]').count()) === 0) break;
    await jolt(page);
    await page.waitForTimeout(300);
  }
  await expect(page.getByTestId('notice').filter({ hasText: 'shattered' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('tracker')).toBeHidden();
});
