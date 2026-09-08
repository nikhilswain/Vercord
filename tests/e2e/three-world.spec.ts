import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/map/demo?renderer=3d');
  await expect(page.locator('canvas[data-world-ready="true"]')).toBeVisible();
}

async function visit(page: Page, room: string) {
  await page.locator('.world-room-directory summary').click();
  await page.getByRole('button', { name: `Visit #${room}`, exact: false }).click();
  await expect(page.locator('.world-location > strong')).toHaveText(`#${room}`);
}

test('3D village loads both sample characters, explores rooms, and retains camera zoom after movement', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const woman = page.waitForResponse('**/three-characters/animated-woman.glb');
  await ready(page);
  expect((await woman).ok()).toBe(true);
  const hoodie = page.waitForResponse('**/three-characters/hoodie-character.glb');
  await page.getByRole('button', { name: 'Change character' }).click();
  expect((await hoodie).ok()).toBe(true);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.locator('.world-zoom')).not.toHaveText('100%');
  await page.screenshot({ path: 'test-results/three-world/desktop.png' });
  const zoom = await page.locator('.world-zoom').textContent();
  await page.locator('canvas').focus();
  await page.keyboard.down('w');
  await page.waitForTimeout(400);
  await page.keyboard.up('w');
  await expect(page.locator('.world-zoom')).toHaveText(zoom!);
  await page.getByRole('button', { name: 'Rotate camera right' }).click();
  await page.getByRole('button', { name: 'Center on avatar' }).click();
  await expect(page.locator('.world-zoom')).toHaveText('100%');
  await visit(page, 'welcome');
  const exit = page.getByRole('button', { name: /Leave.*welcome/ });
  await expect(exit).toBeVisible();
  await page.locator('canvas').press('e');
  await expect(page.locator('.world-location-kicker')).toHaveText('Now exploring');
  await visit(page, 'voice lounge');
  await expect(page.locator('.world-location-meta').first()).toContainText('voice room');
  await page.screenshot({ path: 'test-results/three-world/room.png' });
  expect(errors).toEqual([]);
});

test('3D mobile controls and room directory fit a 390px screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const controls = await page.locator('.world-controls button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const r = button.getBoundingClientRect();
      return (
        r.x >= 0 &&
        r.y >= 0 &&
        r.right <= innerWidth &&
        r.bottom <= innerHeight &&
        r.width >= 44 &&
        r.height >= 44
      );
    }),
  );
  expect(controls.every(Boolean)).toBe(true);
  await page.screenshot({ path: 'test-results/three-world/mobile.png' });
  await visit(page, 'media gallery');
  await expect(page.getByRole('button', { name: /Leave.*media gallery/ })).toBeVisible();
  await page.getByRole('button', { name: /Leave.*media gallery/ }).click();
  await expect(page.locator('.world-location-kicker')).toHaveText('Now exploring');
});

test('failed character downloads retain a playable world and keyboard room navigation', async ({
  page,
}) => {
  await page.route('**/three-characters/*.glb', (route) => route.abort());
  await ready(page);
  await visit(page, 'welcome');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.locator('canvas').press('e');
  await expect(page.locator('.world-location-kicker')).toHaveText('Now exploring');
});

test('WebGL context loss provides reload and pixel-view recovery', async ({ page }) => {
  await ready(page);
  await page
    .locator('canvas')
    .evaluate((canvas) =>
      canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })),
    );
  await expect(page.getByRole('alert')).toContainText('The 3D world could not start');
  await expect(page.getByRole('link', { name: 'Try again' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open pixel view' })).toHaveAttribute(
    'href',
    '/map/demo?renderer=2d',
  );
});

test('pixel renderer remains available for comparison', async ({ page }) => {
  await ready(page);
  await page.getByRole('link', { name: 'Pixel 2D', exact: true }).click();
  await expect(page).toHaveURL(/renderer=2d/);
  await expect(page.getByText('Building the world…')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /^Playable map/);
  await page.getByRole('link', { name: '3D experiment' }).click();
  await expect(page.locator('canvas[data-world-ready="true"]')).toBeVisible();
});
