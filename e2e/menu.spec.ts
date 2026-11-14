import { expect, test } from '@playwright/test';

test.describe('a first launch', () => {
  // Fresh browser: default settings, so the new game starts with flight assist on.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('opens on the main menu, launches from the bay and walks the first tutorial steps', async ({ page }) => {
    await page.goto('/?quality=low');
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await page.getByTestId('start').click();
    await expect(page.getByTestId('main-menu')).toBeHidden();
    // The first sortie starts out of the bay, not on the contract board.
    await expect(page.getByTestId('launch')).toBeVisible();
    await expect(page.getByTestId('station')).toBeHidden();
    const card = page.getByTestId('tutorial');
    await expect(card).toContainText('1/13');
    await expect(page.getByTestId('launch')).toBeHidden({ timeout: 10_000 });
    await expect(card).toContainText('1/13');
    await expect(page.getByTestId('flight-mode')).toHaveAttribute('data-mode', 'assisted');
    await page.mouse.move(0, 0);
    await page.keyboard.down('w');
    await expect(card).toContainText('2/13', { timeout: 30_000 });
    await page.keyboard.up('w');
    // Assist would stop the ship anyway; the step waits for the brake itself.
    await page.keyboard.down('Space');
    await expect(card).toContainText('3/13', { timeout: 30_000 });
    await page.keyboard.up('Space');
    await page.keyboard.press('c');
    await expect(page.getByTestId('flight-mode')).toHaveAttribute('data-mode', 'newtonian');
    await expect(card).toContainText('4/13');
  });

  test('a verb done ahead of its step is not asked again', async ({ page }) => {
    await page.goto('/?quality=low');
    await page.getByTestId('start').click();
    const card = page.getByTestId('tutorial');
    await expect(page.getByTestId('launch')).toBeHidden({ timeout: 10_000 });
    // Scan now, long before the scanning step, then jump to the end of the flight lessons.
    await page.keyboard.press('r');
    await page.evaluate(() => {
      const game = (window as unknown as { voidFrontier: { tutorialStep: number | null; beginTutorialStep(): void } }).voidFrontier;
      game.tutorialStep = 5; // stop: flight assist brings the ship to a stop
      game.beginTutorialStep();
    });
    // Stop (6/13) and assist (7/13) pass on their own; scanning (8/13) was already done,
    // so the card goes straight to mining.
    await expect(card).toContainText('9/13', { timeout: 20_000 });
  });

  test('the docking checklist stays away from a ship leaving the bay', async ({ page }) => {
    await page.goto('/?quality=low');
    await page.getByTestId('tutorial-toggle').uncheck();
    await page.getByTestId('start').click();
    await page.getByTestId('undock').click();
    await page.mouse.move(0, 0);
    await page.keyboard.press('v'); // fly by keyboard: the nose stays where we put it
    await page.evaluate(() => {
      const game = (window as unknown as { voidFrontier: { undockedAt: number; sim: { playerId: number; world: { bodies: Map<number, { position: { x: number; y: number }; previousPosition: { x: number; y: number }; velocity: { x: number; y: number }; angle: number; previousAngle: number }> } } } }).voidFrontier;
      game.undockedAt = -100;
      const body = game.sim.world.bodies.get(game.sim.playerId)!;
      // About 180 m out in front of the bay (its centre is near x = 200), still, nose away from it.
      body.position = { x: 380, y: 0 };
      body.previousPosition = { ...body.position };
      body.velocity = { x: 0, y: 0 };
      body.angle = 0;
      body.previousAngle = 0;
    });
    await page.waitForTimeout(1000);
    await expect(page.getByTestId('docking')).toBeHidden();
    // Turning the nose onto the bay makes it an approach.
    await page.evaluate(() => {
      const game = (window as unknown as { voidFrontier: { sim: { playerId: number; world: { bodies: Map<number, { angle: number; previousAngle: number }> } } } }).voidFrontier;
      const body = game.sim.world.bodies.get(game.sim.playerId)!;
      body.angle = Math.PI;
      body.previousAngle = Math.PI;
    });
    await expect(page.getByTestId('docking')).toBeVisible();
  });
});

test('saves to a slot from the pause menu and continues after a reload', async ({ page }) => {
  await page.goto('/?quality=low');
  await page.getByTestId('tutorial-toggle').uncheck();
  await page.getByTestId('start').click();
  await page.getByTestId('undock').click();
  await page.keyboard.down('w');
  await expect.poll(async () => Number(await page.getByTestId('speed').getAttribute('data-value')), { timeout: 30_000 }).toBeGreaterThan(3);
  await page.keyboard.up('w');
  await page.keyboard.press('Escape');
  await page.getByTestId('open-save').click();
  await page.getByTestId('save-slot1').click();
  await expect(page.getByTestId('slot-slot1')).not.toContainText(/Empty|Vazio/);
  const speed = Number(await page.getByTestId('speed').getAttribute('data-value'));
  expect(speed).toBeGreaterThan(1);

  await page.reload();
  await expect(page.getByTestId('continue')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('station')).toBeHidden();
  await expect.poll(async () => Number(await page.getByTestId('speed').getAttribute('data-value'))).toBeGreaterThan(1);
});
