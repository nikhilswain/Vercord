import { expect, test } from '@playwright/test';

test('renders the document with a dark CSS color scheme', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#080c18');
});

test('themes nested owned scroll surfaces with the standards scrollbar properties', async ({
  page,
}) => {
  await page.goto('/');

  const scrollbar = await page.evaluate(() => {
    const surface = document.createElement('div');
    surface.dataset.testid = 'nested-scroll-surface';
    surface.style.cssText = 'width: 2rem; height: 2rem; overflow: scroll;';

    const content = document.createElement('div');
    content.style.cssText = 'width: 4rem; height: 4rem;';
    surface.append(content);
    document.body.append(surface);

    const style = getComputedStyle(surface);

    return {
      color: style.scrollbarColor,
      supportsStandardsWidth: CSS.supports('scrollbar-width', 'thin'),
      width: style.scrollbarWidth,
    };
  });

  expect(scrollbar.color).not.toBe('auto');
  if (scrollbar.supportsStandardsWidth) {
    expect(scrollbar.width).toBe('thin');
  }

  await page.emulateMedia({ forcedColors: 'active' });

  const forcedColorsScrollbar = await page
    .locator('[data-testid="nested-scroll-surface"]')
    .evaluate((surface) => {
      const style = getComputedStyle(surface);

      return {
        color: style.scrollbarColor,
        width: style.scrollbarWidth,
      };
    });

  expect(forcedColorsScrollbar.color).toBe('auto');
  if (scrollbar.supportsStandardsWidth) {
    expect(forcedColorsScrollbar.width).toBe('auto');
  }
});

test('serves the Dmap shell and Worker health route together', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Turn your server into a world worth exploring.',
    }),
  ).toBeVisible();
  await expect(page.getByText('Atlas phase')).toBeVisible();

  const healthResponse = await page.request.get('/api/health');

  expect(healthResponse.status()).toBe(200);
  expect(await healthResponse.json()).toEqual({
    service: 'dmap',
    status: 'ok',
  });
});

test('renders the application-owned not-found view for a nested path', async ({ page }) => {
  await page.goto('/worlds/foundation');

  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Return home' })).toBeVisible();
});
