import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Inspect and position the actual runtime through a test-only module response.
  await page.route('**/src/features/rpg/rpg-scene.ts*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()).replace(
        'create() {',
        'create() { globalThis.__hallScene = this;',
      ),
    });
  });
});

const approach = async (page: import('@playwright/test').Page, id: string) => {
  await page.evaluate((id) => {
    const scene = (
      globalThis as unknown as {
        __hallScene: {
          simulation: {
            player: { x: number; y: number };
            sample: { landmarks: { id: string; x: number; y: number }[] };
            stop(): void;
          };
          center(): void;
        };
      }
    ).__hallScene;
    const point = scene.simulation.sample.landmarks.find((l) => l.id === id)!;
    scene.simulation.stop();
    scene.simulation.player = { x: point.x, y: point.y + 16 };
    scene.center();
  }, id);
  await page.locator('canvas').focus();
  await page.waitForTimeout(100);
  await page.keyboard.press('e');
};

test('reads real boards, opens a selected direct conversation, and releases gameplay on Escape', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/play/demo?expedition=mosswild&place=town-hall');
  await page.locator('canvas[data-rpg-ready="true"]').waitFor();
  await approach(page, 'hall:expeditions');
  const board = page.getByRole('dialog', { name: 'Expedition board' });
  await expect(board).toBeVisible();
  const boardFrame = (await board.boundingBox())!;
  expect(boardFrame.width).toBeLessThanOrEqual(680);
  expect(boardFrame.height).toBeLessThanOrEqual(720);
  await expect(board.getByRole('button', { name: 'Open Journey' })).toBeVisible();
  await expect(page.locator('.rpg-navigation-hud')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  const before = await page.evaluate(
    () =>
      (globalThis as unknown as { __hallScene: { simulation: { player: { y: number } } } })
        .__hallScene.simulation.player.y,
  );
  await page.keyboard.down('s');
  await page.waitForTimeout(240);
  await page.keyboard.up('s');
  expect(
    await page.evaluate(
      () =>
        (globalThis as unknown as { __hallScene: { simulation: { player: { y: number } } } })
          .__hallScene.simulation.player.y,
    ),
  ).toBeGreaterThan(before + 10);
  await approach(page, 'hall:requests');
  await expect(page.getByRole('heading', { name: 'No commissions posted' })).toBeVisible();
  await page.getByRole('button', { name: 'Read expedition notices' }).click();
  await expect(board).toBeVisible();
  await page.getByRole('button', { name: 'Close board' }).click();
  await approach(page, 'hall:travelers');
  await page.getByRole('button', { name: 'Message Wren' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: /Message Wren/i })).toBeVisible();
  await page.getByRole('textbox', { name: 'Message Wren' }).fill('Checking in from Town Hall.');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Checking in from Town Hall.', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Your whisper reached me. Only the two of us see this direct conversation.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('keeps the cellar and front-door return routes distinct after a reload', async ({ page }) => {
  await page.goto('/play/demo?expedition=mosswild&place=town-hall');
  await page.locator('canvas[data-rpg-ready="true"]').waitFor();
  await approach(page, 'hall:cellar');
  await expect(page).toHaveURL(/theme=dungeon/);
  await page.reload();
  await page.locator('canvas[data-rpg-ready="true"]').waitFor();
  const exitId = await page.evaluate(
    () =>
      (
        globalThis as unknown as {
          __hallScene: {
            simulation: { sample: { landmarks: { id: string; destination?: string }[] } };
          };
        }
      ).__hallScene.simulation.sample.landmarks.find((l) => l.destination === 'return')!.id,
  );
  await approach(page, exitId);
  await expect(page).not.toHaveURL(/theme=dungeon/);
  await expect(page).toHaveURL(/place=town-hall/);
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /^Town Hall/);
  await approach(page, 'hall:exit');
  await expect(page).not.toHaveURL(/place=town-hall/);
  await expect(page.locator('canvas')).not.toHaveAttribute('aria-label', /^Town Hall/);
});

test('keeps the fixed frame and close action reachable on a narrow screen with reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/play/demo?expedition=mosswild&place=town-hall');
  await page.locator('canvas[data-rpg-ready="true"]').waitFor();
  await approach(page, 'hall:expeditions');
  const dialog = page.getByRole('dialog', { name: 'Expedition board' });
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  await expect(page.getByRole('button', { name: 'Close board' })).toBeVisible();
  const body = dialog.locator('.confirm-dialog__body');
  const scroll = await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return { top: element.scrollTop, height: element.clientHeight, content: element.scrollHeight };
  });
  expect(scroll.content).toBeGreaterThan(scroll.height);
  expect(scroll.top).toBeGreaterThan(0);
  expect(await dialog.boundingBox()).toEqual(box);
  await expect(page.getByRole('button', { name: 'Back to hall' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
});
