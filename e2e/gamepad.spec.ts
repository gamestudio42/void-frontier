import { expect, test, type Page } from '@playwright/test';

const value = async (page: Page, id: string) => Number(await page.getByTestId(id).getAttribute('data-value'));

/** A fake standard-mapping pad the test drives through `window.__pad`. */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const state = { axes: [0, 0, 0, 0], buttons: new Array(17).fill(0) as number[] };
    (window as unknown as { __pad: typeof state }).__pad = state;
    navigator.getGamepads = () =>
      [
        {
          id: 'test pad',
          index: 0,
          connected: true,
          mapping: 'standard',
          timestamp: performance.now(),
          axes: state.axes,
          buttons: state.buttons.map((v) => ({ pressed: v > 0.5, touched: v > 0, value: v })),
        },
      ] as unknown as (Gamepad | null)[];
  });
});

const setPad = (page: Page, axes: number[] | null, buttons: Record<number, number> = {}) =>
  page.evaluate(
    ([a, b]) => {
      const pad = (window as unknown as { __pad: { axes: number[]; buttons: number[] } }).__pad;
      if (a) pad.axes = a as number[];
      pad.buttons = pad.buttons.map((_, i) => (b as Record<number, number>)[i] ?? 0);
    },
    [axes, buttons] as const,
  );

/** Press and release a button across a few frames. */
async function tap(page: Page, button: number) {
  await setPad(page, null, { [button]: 1 });
  await page.waitForTimeout(150);
  await setPad(page, null, {});
  await page.waitForTimeout(150);
}

test('a gamepad undocks through the panel, flies on the left stick and shows its own prompts', async ({ page }) => {
  await page.goto('/?quality=low');
  await page.getByTestId('tutorial-toggle').uncheck();
  await page.getByTestId('start').click();
  await page.mouse.move(0, 0);
  await expect(page.getByTestId('undock')).toBeVisible();

  // Docked, the d-pad walks the panel's controls and A presses the focused one.
  for (let i = 0; i < 80; i++) {
    if (await page.getByTestId('undock').evaluate((el) => el === document.activeElement)) break;
    await tap(page, 13);
  }
  await expect(page.getByTestId('undock')).toBeFocused();
  await expect(page.getByTestId('undock')).toContainText('Ⓐ');
  await tap(page, 0);
  await expect(page.getByTestId('undock')).toBeHidden();

  // In flight the footer names pad buttons, and the left stick is the throttle.
  await expect(page.getByTestId('pad-hints')).toBeVisible();
  await setPad(page, [0, -1, 0, 0]);
  await expect.poll(() => value(page, 'speed'), { timeout: 15_000 }).toBeGreaterThan(5);
  await setPad(page, [0, 0, 0, 0]);

  // Holding B brakes to a stop.
  await setPad(page, null, { 1: 1 });
  await expect.poll(() => value(page, 'speed'), { timeout: 30_000 }).toBeLessThan(0.5);
  await setPad(page, null, {});

  // Any key brings the keyboard prompts back.
  await page.keyboard.press('h');
  await page.keyboard.press('h');
  await expect(page.getByTestId('pad-hints')).toBeHidden();
});
