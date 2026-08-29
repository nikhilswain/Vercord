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

test('home and atlas reflow at 320px without concealed document overflow', async ({ page }) => {
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
});
