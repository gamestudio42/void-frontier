import { expect, test } from '@playwright/test';

test('opens on the main menu and walks the first tutorial steps', async ({ page }) => {
  await page.goto('/?quality=low');
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('main-menu')).toBeHidden();
  const card = page.getByTestId('tutorial');
  await expect(card).toContainText('1/10');
  await page.getByTestId('undock').click();
  await expect(card).toContainText('2/10');
  await page.keyboard.down('w');
  await expect(card).toContainText('3/10', { timeout: 30_000 });
  await page.keyboard.up('w');
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
  await expect(page.getByTestId('continue')).toBeVisible();
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('station')).toBeHidden();
  await expect.poll(async () => Number(await page.getByTestId('speed').getAttribute('data-value'))).toBeGreaterThan(1);
});
