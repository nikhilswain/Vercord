import { expect, test } from '@playwright/test';

test('renders the document with a dark CSS color scheme', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
});

test('serves the Dmap shell and Worker health route together', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Turn your server into a world worth exploring.',
    }),
  ).toBeVisible();
  await expect(page.getByText('Foundation ready')).toBeVisible();

  const healthResponse = await page.request.get('/api/health');

  expect(healthResponse.status()).toBe(200);
  expect(await healthResponse.json()).toEqual({
    service: 'dmap',
    status: 'ok',
  });
});

test('serves the Dmap shell for a nested non-API navigation', async ({ page }) => {
  await page.goto('/worlds/foundation');

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Turn your server into a world worth exploring.',
    }),
  ).toBeVisible();
});
