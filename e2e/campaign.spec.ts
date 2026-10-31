import { expect, test } from '@playwright/test';

test('shows the story after undocking and moves on when the objective is met', async ({ page }) => {
  test.slow();
  await page.goto('/?quality=low');
  await page.getByTestId('tutorial-toggle').uncheck();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('station')).toBeVisible();
  await expect(page.getByTestId('campaign')).toHaveCount(0);
  await page.getByTestId('undock').click();
  await expect(page.getByTestId('campaign')).toContainText('Distress on the line');
  await page.evaluate(() => {
    const game = (window as unknown as { voidFrontier: { sim: { playerId: number; world: { bodies: Map<number, { position: object; previousPosition: object }>; pointsOfInterest: Map<string, { position: { x: number; y: number } }> } } } }).voidFrontier;
    const body = game.sim.world.bodies.get(game.sim.playerId)!;
    const at = game.sim.world.pointsOfInterest.get('alpha_wreck')!.position;
    body.position = { ...at };
    body.previousPosition = { ...at };
  });
  await expect(page.getByTestId('campaign')).toContainText('Whoever did this');
});

test('closes the story with an ending card when the last mission is done', async ({ page }) => {
  test.slow();
  await page.goto('/?quality=low');
  await page.getByTestId('tutorial-toggle').uncheck();
  await page.getByTestId('start').click();
  await page.getByTestId('undock').click();
  await page.evaluate(() => {
    const game = (window as unknown as { voidFrontier: { sim: { campaign: { step: number }; world: { events: unknown[] } }; store: { update(p: object): void } } }).voidFrontier;
    game.sim.campaign.step = 18;
    game.sim.world.events.push({ type: 'campaign', step: 'flagship', credits: 6000, finished: true });
  });
  await expect(page.getByTestId('campaign-ending')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('campaign-ending').getByRole('button').click();
  await expect(page.getByTestId('campaign-ending')).toHaveCount(0);
  await expect(page.getByTestId('campaign')).toHaveCount(0);
});
