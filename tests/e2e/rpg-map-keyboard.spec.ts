import { expect, test } from '@playwright/test';

for (const opening of ['button', 'Tab', 'double Tab'] as const) {
  test(`returns from an untouched pin editor one Escape at a time after opening with ${opening}`, async ({
    page,
  }) => {
    await page.goto('/play/demo?expedition=mosswild');
    const canvas = page.locator('canvas.rpg-canvas');
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute('data-rpg-ready', 'true', { timeout: 60_000 });
    await expect(page.locator('.rpg-stage[inert]')).toHaveCount(0);
    if (opening === 'button') {
      await page.getByRole('button', { name: 'Map', exact: true }).click();
    } else {
      await canvas.focus();
      await page.keyboard.press('Tab');
      if (opening === 'double Tab') await page.keyboard.press('Tab');
    }
    const map = page.getByRole('dialog', { name: /atlas$/ });
    const chart = map.getByRole('group', { name: /^World atlas/ });
    await expect(chart).toBeFocused();
    if (opening !== 'double Tab') await page.keyboard.press('Space');
    await expect(chart).toHaveAttribute('data-detail', 'true');
    await expect
      .poll(async () =>
        Number((await map.getByLabel('Map zoom', { exact: true }).textContent())?.replace('%', '')),
      )
      .toBeGreaterThan(130);
    await page.keyboard.press('Space');
    const editor = page.getByRole('dialog', { name: 'Leave a pin' });
    await expect(editor).toBeVisible();

    // No typing, clicking or panning between Escapes: those grant new user
    // activation and mask the browser's non-cancelable native close request.
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
    await expect(chart).toHaveAttribute('data-detail', 'true');
    await expect(chart).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(map).toBeVisible();
    await expect(chart).toHaveAttribute('data-detail', 'false');
    await page.keyboard.press('Escape');
    await expect(page.locator('.rpg-atlas-dialog')).toHaveCount(0);
    await expect(canvas).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(map).toBeVisible();
    await expect(chart).toHaveAttribute('data-detail', 'false');
  });
}
