import { expect, test, type Page } from '@playwright/test';

async function readCameraMatrix(page: Page) {
  const matrix = await page
    .getByRole('region', { name: 'Atlas viewport' })
    .locator('svg > g[transform]')
    .getAttribute('transform');
  if (!matrix) throw new Error('The atlas camera did not expose a transform matrix.');
  return matrix;
}

test('opens the demo atlas with its scoped status and a resettable camera', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await page.getByRole('link', { name: 'Explore demo map' }).click();
  await expect(page).toHaveURL('/map/demo');
  await expect(page.getByRole('heading', { name: 'Explore Northstar Commons' })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('status')).toHaveText('Demo data');

  const viewport = page.getByRole('region', { name: 'Atlas viewport' });
  const atlas = page.getByRole('img', { name: 'Northstar Commons atlas' });
  await expect(atlas).toBeVisible();
  await expect(atlas).toHaveAttribute('width', '100%');
  await expect(atlas).toHaveAttribute('height', '100%');
  expect(
    await atlas.evaluate((svg) => ({
      hasPreserveAspectRatio: svg.hasAttribute('preserveAspectRatio'),
      hasViewBox: svg.hasAttribute('viewBox'),
    })),
  ).toEqual({ hasPreserveAspectRatio: false, hasViewBox: false });
  expect(
    await viewport.evaluate((frame) => ({
      clipOverflow: getComputedStyle(frame.querySelector(':scope > div')!).overflow,
      frameOverflow: getComputedStyle(frame).overflow,
      tabIndex: frame.getAttribute('tabindex'),
    })),
  ).toEqual({ clipOverflow: 'hidden', frameOverflow: 'visible', tabIndex: '0' });
  await viewport.focus();
  await expect(viewport).toBeFocused();

  const initialMatrix = await readCameraMatrix(page);
  expect(
    await viewport.locator('svg > g[transform]').evaluate((world) => {
      const values = (
        world.getAttribute('transform')?.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/giu) ?? []
      ).map(Number);
      return values.length === 6 && values.every(Number.isFinite);
    }),
  ).toBe(true);
  const zoom = page.getByRole('status', { name: 'Map zoom' });
  await expect(zoom).toHaveText(/^\d+%$/);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(() => readCameraMatrix(page)).not.toBe(initialMatrix);
  await expect(zoom).not.toHaveText(/^50%$/);
  await page.getByRole('button', { name: 'Reset view' }).click();
  const resetMatrix = await readCameraMatrix(page);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(() => readCameraMatrix(page)).not.toBe(resetMatrix);
  await page.getByRole('button', { name: 'Reset view' }).click();
  await expect.poll(() => readCameraMatrix(page)).toBe(resetMatrix);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);

  const screenshotPath = 'test-results/map-demo/desktop.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach('map-demo-desktop', { path: screenshotPath, contentType: 'image/png' });
});

test('search and directory selections restore focus to their origin', async ({ page }) => {
  await page.goto('/map/demo');

  const search = page.getByRole('combobox', { name: 'Search rooms' });
  const details = page.getByRole('region', { name: 'Room details' });
  await expect(details).toHaveCount(1);
  await search.fill('welcome');
  await expect(page.getByRole('status', { name: 'Search result count' })).toHaveText('1 result');
  await search.press('Enter');
  await expect(details.getByRole('heading', { name: 'welcome' })).toBeVisible();
  await page.getByRole('button', { name: 'Close room details' }).click();
  await expect(search).toBeFocused();

  const directoryWelcome = page
    .getByRole('navigation', { name: 'Room directory' })
    .getByRole('button', { name: /welcome/ });
  await directoryWelcome.click();
  await expect(details.getByRole('heading', { name: 'welcome' })).toBeVisible();
  await page.getByRole('button', { name: 'Close room details' }).click();
  await expect(directoryWelcome).toBeFocused();
});

test('the 320px layout fits the document while the nested atlas clip owns cropping', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 760 });

  for (const route of ['/', '/map/demo']) {
    await page.goto(route);
    expect(
      await page.evaluate(() => ({
        bodyOverflowX: getComputedStyle(document.body).overflowX,
        fits: document.documentElement.scrollWidth <= innerWidth,
        htmlOverflowX: getComputedStyle(document.documentElement).overflowX,
      })),
    ).toEqual({ bodyOverflowX: 'visible', fits: true, htmlOverflowX: 'visible' });
  }

  const viewport = page.getByRole('region', { name: 'Atlas viewport' });
  const atlas = page.getByRole('img', { name: 'Northstar Commons atlas' });
  await expect(atlas).toBeVisible();
  expect(
    await viewport.evaluate((frame) => ({
      clipOverflow: getComputedStyle(frame.querySelector(':scope > div')!).overflow,
      documentFits: document.documentElement.scrollWidth <= innerWidth,
      frameOverflow: getComputedStyle(frame).overflow,
      svgHeight: frame.querySelector('svg')!.getAttribute('height'),
      svgWidth: frame.querySelector('svg')!.getAttribute('width'),
    })),
  ).toEqual({
    clipOverflow: 'hidden',
    documentFits: true,
    frameOverflow: 'visible',
    svgHeight: '100%',
    svgWidth: '100%',
  });

  const screenshotPath = 'test-results/map-demo/mobile-320.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach('map-demo-mobile-320', { path: screenshotPath, contentType: 'image/png' });
});
