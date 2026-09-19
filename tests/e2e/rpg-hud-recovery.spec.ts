import { expect, test, type Page } from '@playwright/test';

type Scene = {
  simulation: { player: { x: number; y: number } };
  activeAdventure(): { melee: unknown } | null;
};
const position = (page: Page) =>
  page.evaluate(() => ({
    ...(globalThis as unknown as { __hudScene: Scene }).__hudScene.simulation.player,
  }));
async function walk(page: Page, key = 'w') {
  const before = await position(page);
  await page.keyboard.down(key);
  await page.waitForTimeout(300);
  await page.keyboard.up(key);
  const after = await position(page);
  return Math.hypot(after.x - before.x, after.y - before.y);
}

for (const [area, path] of [
  ['town', '/play/demo?expedition=mosswild'],
  ['adventure', '/play/demo?expedition=mosswild&forest=verge'],
]) {
  test(`can play while reading chat in ${area}, type safely, then resume without closing chat`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/src/features/rpg/rpg-scene.ts*', async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: (await response.text()).replace(
          'create() {',
          'create() { globalThis.__hudScene = this;',
        ),
      });
    });
    await page.goto(path!);
    const canvas = page.locator('canvas[data-rpg-ready="true"]');
    await expect(canvas).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Open chat', exact: true }).click();
    const chat = page.getByRole('dialog', { name: 'Chat', exact: true });
    const input = chat.getByRole('textbox', { name: 'Message World' });
    await expect(chat).toBeVisible();
    await expect(input).not.toBeFocused();
    expect(await walk(page)).toBeGreaterThan(8);
    await chat.locator('.rpg-chat-log').click();
    expect(await walk(page, 's')).toBeGreaterThan(8);
    if (area === 'adventure') {
      await page.keyboard.press('j');
      const attacking = () =>
        page.evaluate(() =>
          Boolean(
            (globalThis as unknown as { __hudScene: Scene }).__hudScene.activeAdventure()?.melee,
          ),
        );
      await expect.poll(attacking).toBe(true);
      await expect.poll(attacking).toBe(false);
    }

    await input.click();
    expect(await walk(page)).toBe(0);
    await page.keyboard.press('i');
    await page.keyboard.press('Tab');
    await expect(input).toBeFocused();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await input.fill('Reading the trail together');
    await page.keyboard.press('Enter');
    await expect(chat.getByText('Reading the trail together', { exact: true })).toBeVisible();
    await expect(input).toHaveValue('');

    // A real canvas pointer event must release input focus in one click.
    await canvas.click({ position: { x: 850, y: 240 } });
    await expect(canvas).toBeFocused();
    expect(await walk(page)).toBeGreaterThan(8);
    await expect(chat).toBeVisible();
    await page.screenshot({ path: info.outputPath(`chat-${area}.png`) });
    await page.keyboard.press('i');
    await expect(page.getByRole('dialog', { name: 'Inventory', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(chat).toBeVisible();
    expect(await walk(page, 's')).toBeGreaterThan(8);
    await page.keyboard.press('Tab');
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(chat).toBeVisible();
    await chat.getByRole('button', { name: 'Close Chat', exact: true }).click();
    await expect(canvas).toBeFocused();
    expect(errors).toEqual([]);
  });
}

for (const width of [1280, 390]) {
  test(`saved forest loading, failure and retry keep the game theme at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requests = 0;
    await page.route('**/api/auth/guilds/123/rpg/village?forest=verge', async (route) => {
      requests++;
      if (requests === 1) await pending;
      await route.fulfill({
        status: requests === 1 ? 500 : 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'UNAVAILABLE' } }),
      });
    });
    await page.goto('/play/123?forest=verge');
    const panel = page.locator('.rpg-state-panel');
    await expect(page.getByRole('heading', { name: 'Following the forest trail…' })).toBeVisible();
    await expect(page.locator('main')).toHaveAttribute('data-ui', 'ornate');
    await expect(panel).toHaveCSS('color', 'rgb(240, 227, 191)');
    await expect(panel).toHaveCSS('font-family', /Pixelify Sans/);
    await expect(panel).toHaveCSS('border-image-source', /ornate-retro\/panel.svg/);
    await expect(panel.locator('h1')).toHaveCSS('font-family', /Alagard/);
    await expect(panel.locator('.rpg-state-progress i').first()).toHaveCSS(
      'animation-name',
      'none',
    );
    const bounds = (await panel.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
    await page.screenshot({ path: info.outputPath(`forest-loading-${width}.png`) });
    release();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(panel.locator('.rpg-state-progress')).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Return to town' })).toBeVisible();
    await panel.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'Your town is waiting' })).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Continue with Discord' })).toBeVisible();
    expect(requests).toBe(2);
    await page.screenshot({ path: info.outputPath(`sign-in-${width}.png`) });
  });
}
