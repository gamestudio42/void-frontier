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
