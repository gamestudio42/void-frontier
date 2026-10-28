import { expect, test } from '@playwright/test';

interface DevGame {
  sim: {
    playerId: number;
    world: {
      gates: Map<string, { position: { x: number; y: number } }>;
      bodies: Map<number, { position: { x: number; y: number }; previousPosition: { x: number; y: number }; velocity: { x: number; y: number } }>;
    };
  };
}

async function parkInGate(page: import('@playwright/test').Page, gateId: string) {
  await page.evaluate((id) => {
    const game = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    const gate = game.sim.world.gates.get(id)!;
    const body = game.sim.world.bodies.get(game.sim.playerId)!;
    body.position = { ...gate.position };
    body.previousPosition = { ...gate.position };
    body.velocity = { x: 0, y: 0 };
  }, gateId);
}

test('jumps to the Industrial Belt and back, and shows the sector map', async ({ page }) => {
  await page.goto('/?quality=low');
  await page.getByTestId('tutorial-toggle').uncheck();
  await page.getByTestId('start').click();
  await page.getByTestId('undock').click();
  await expect(page.getByTestId('sector')).toHaveAttribute('data-value', 'outpost_alpha');

  await parkInGate(page, 'alpha_to_belt');
  await expect(page.getByTestId('gate')).toHaveClass(/ready/, { timeout: 20_000 });
  await page.keyboard.press('f');
  await expect(page.getByTestId('sector')).toHaveAttribute('data-value', 'industrial_belt');

  await page.keyboard.press('m');
  await expect(page.getByTestId('map')).toBeVisible();
  await page.keyboard.press('m');
  await expect(page.getByTestId('map')).toBeHidden();

  await parkInGate(page, 'belt_to_alpha');
  await expect(page.getByTestId('gate')).toHaveClass(/ready/, { timeout: 20_000 });
  await page.keyboard.press('f');
  await expect(page.getByTestId('sector')).toHaveAttribute('data-value', 'outpost_alpha');
});
