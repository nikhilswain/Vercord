import { expect, test } from '@playwright/test';

test('opens the first visible invented atlas from home and directly', async ({
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
  await expect(page.getByRole('status')).toHaveText('Demo data');
  await expect(page.getByRole('img', { name: 'Northstar Commons atlas' })).toBeVisible();
  await expect(page.locator('.atlas-area').first()).toBeVisible();
  await expect(page.locator('.atlas-room').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.goto('/map/demo');
  await expect(page.getByRole('img', { name: 'Northstar Commons atlas' })).toBeVisible();
  expect(errors).toEqual([]);
  await testInfo.attach('first-visible-atlas', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

test('home reflows and the atlas stays legible in its owned scroller at 320px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 760 });

  for (const route of ['/', '/map/demo']) {
    await page.goto(route);
    expect(
      await page.evaluate(() => ({
        bodyOverflowX: getComputedStyle(document.body).overflowX,
        htmlOverflowX: getComputedStyle(document.documentElement).overflowX,
        fits: document.documentElement.scrollWidth <= innerWidth,
      })),
    ).toEqual({ bodyOverflowX: 'visible', htmlOverflowX: 'visible', fits: true });
  }

  await expect(page.getByRole('heading', { name: 'Explore Northstar Commons' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Northstar Commons atlas' })).toBeVisible();

  const atlasPresentation = await page.locator('.map-viewport').evaluate((viewport) => {
    const svg = viewport.querySelector('svg')!;
    const districtLabel = viewport.querySelector('.atlas-area > text:not(.atlas-room-count)')!;
    const roomLabel = viewport.querySelector('.atlas-room > text')!;

    return {
      districtLabelHeight: districtLabel.getBoundingClientRect().height,
      documentFits: document.documentElement.scrollWidth <= innerWidth,
      roomLabelHeight: roomLabel.getBoundingClientRect().height,
      svgHasTabIndex: svg.hasAttribute('tabindex'),
      svgWidth: svg.getBoundingClientRect().width,
      viewportClientWidth: viewport.clientWidth,
      viewportOverflowX: getComputedStyle(viewport).overflowX,
      viewportScrollWidth: viewport.scrollWidth,
    };
  });

  expect(atlasPresentation.documentFits).toBe(true);
  expect(atlasPresentation.viewportOverflowX).toBe('auto');
  expect(atlasPresentation.viewportScrollWidth).toBeGreaterThan(
    atlasPresentation.viewportClientWidth,
  );
  expect(atlasPresentation.svgWidth).toBeGreaterThan(atlasPresentation.viewportClientWidth);
  expect(atlasPresentation.districtLabelHeight).toBeGreaterThanOrEqual(16);
  expect(atlasPresentation.roomLabelHeight).toBeGreaterThanOrEqual(11);
  expect(atlasPresentation.svgHasTabIndex).toBe(false);
});
