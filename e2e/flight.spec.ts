import { expect, test, type Page } from '@playwright/test';

const value = async (page: Page, id: string) => Number(await page.getByTestId(id).getAttribute('data-value'));

/** Holds a key for real time; the game reads held keys every frame. */
async function hold(page: Page, key: string, ms: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?quality=low');
  await page.getByTestId('tutorial-toggle').uncheck();
  await page.getByTestId('start').click();
  // The game starts docked at Outpost Alpha.
  await page.getByTestId('undock').click();
  // Keep the cursor off the canvas so mouse steering does not turn the ship.
  await page.mouse.move(0, 0);
});

test('boots into Outpost Alpha with a stationary ship', async ({ page }) => {
  await expect(page.getByTestId('viewport')).toBeVisible();
  await expect(page.getByTestId('flight-mode')).toHaveAttribute('data-mode', 'newtonian');
  expect(await value(page, 'speed')).toBe(0);
});

test('thrust accelerates, the ship coasts, and fuel is spent', async ({ page }) => {
  const fuelBefore = await value(page, 'fuel');
  await hold(page, 'w', 1200);
  await page.waitForTimeout(300);
  const coasting = await value(page, 'speed');
  expect(coasting).toBeGreaterThan(1);
  await page.waitForTimeout(800);
  expect(await value(page, 'speed')).toBeCloseTo(coasting, 6);
  expect(await value(page, 'fuel')).toBeLessThan(fuelBefore);
});

test('flight assist and the brake bring the ship to a stop', async ({ page }) => {
  await hold(page, 'w', 800);
  expect(await value(page, 'speed')).toBeGreaterThan(1);
  await page.keyboard.press('c');
  await expect(page.getByTestId('flight-mode')).toHaveAttribute('data-mode', 'assisted');
  await expect.poll(() => value(page, 'speed'), { timeout: 20_000 }).toBeLessThan(0.01);

  await page.keyboard.press('c');
  await hold(page, 'w', 800);
  await page.keyboard.down('Space');
  await expect.poll(() => value(page, 'speed'), { timeout: 20_000 }).toBeLessThan(0.01);
  await page.keyboard.up('Space');
});

test('pause freezes the simulation', async ({ page }) => {
  await hold(page, 'w', 600);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause')).toBeVisible();
  const before = await page.getByTestId('heading').getAttribute('data-value');
  const speed = await value(page, 'speed');
  await page.waitForTimeout(600);
  expect(await value(page, 'speed')).toBe(speed);
  expect(await page.getByTestId('heading').getAttribute('data-value')).toBe(before);
});
