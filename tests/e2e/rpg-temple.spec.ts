import { expect, test, type Page } from '@playwright/test';

const saveKey = 'dmap:forest-journey:v1:preview';
// Persisted v1 saves are the browser boundary, including old empty/default inventory records.
const snapshot = (story: string[] = []) => ({
  version: 1,
  traveler: {
    inventory: {},
    progression: {},
    health: 100,
    herbs: 0,
    spell: 'fire',
    combatMode: 'melee',
  },
  story,
  visited: [],
  discovered: [] as string[],
  areas: [],
});
async function ready(page: Page) {
  await expect(page.locator('canvas.rpg-canvas')).toHaveAttribute('data-rpg-ready', 'true', {
    timeout: 45_000,
  });
  await expect(page.locator('.rpg-stage[inert]')).toHaveCount(0);
}
async function journal(page: Page) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: /^Journey/ }).click();
  return page.getByRole('dialog', { name: 'Journey', exact: true });
}

test('a locked sanctuary bookmark reaches Mira; dialogue and recall preserve the server-style journey', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/play/demo?expedition=mosswild&forest=temple-interior');
  await ready(page);
  await expect(page.locator('main.rpg-page')).toHaveAttribute('data-temple-area', 'temple');
  await expect(page).toHaveURL(/forest=temple(?:&|$)/);
  await expect(page.getByRole('button', { name: 'Stop navigation', exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('courtyard.png') });
  await page.locator('canvas.rpg-canvas').focus();
  for (const key of ['a', 'w']) {
    await page.keyboard.down(key);
    await page.waitForTimeout(250);
    await page.keyboard.up(key);
  }
  await page.getByRole('button', { name: /Talk to Mira/ }).click();
  await expect(page.getByRole('dialog', { name: 'Mira', exact: true })).toContainText('Six voices');
  for (let line = 0; line < 4; line++) await page.keyboard.press('e');
  await expect(page.getByRole('dialog', { name: 'Mira', exact: true })).toHaveCount(0);
  const book = await journal(page);
  await expect(
    book.getByRole('heading', { name: 'Defeat the courtyard Root Beast', exact: true }),
  ).toBeVisible();
  await book.getByRole('button', { name: 'Show on map' }).click();
  await expect(page.getByRole('dialog', { name: /atlas$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Back to exploring', exact: true }).click();
  await page.locator('canvas.rpg-canvas').focus();
  await page.keyboard.press('g');
  await expect(page).not.toHaveURL(/forest=/, { timeout: 15_000 });
  await ready(page);
  const townJournal = await journal(page);
  await expect(
    townJournal.getByRole('heading', { name: 'Defeat the courtyard Root Beast', exact: true }),
  ).toBeVisible();
  await page.reload();
  await ready(page);
  const restored = await journal(page);
  await expect(
    restored.getByRole('heading', { name: 'Defeat the courtyard Root Beast', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('the forest journal points at the temple entrance without automatically starting navigation', async ({
  page,
}, info) => {
  const save = snapshot();
  save.discovered = ['verge-site-1', 'verge-site-4', 'alder-run-site-2'];
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: saveKey,
    value: save,
  });
  await page.goto('/play/demo?expedition=mosswild&forest=alder-run');
  await ready(page);
  const book = await journal(page);
  await expect(book).toContainText('Rootbound Reach');
  await expect(
    book.getByRole('heading', { name: 'Meet Mira at the ruins', exact: true }),
  ).toBeVisible();
  await book.getByRole('button', { name: 'Show on map' }).click();
  const map = page.getByRole('dialog', { name: 'Mosswild Forest', exact: true });
  await expect(map.getByRole('button', { name: /Rootbound Reach,/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(map.getByRole('region', { name: 'Rootbound Temple', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop navigation', exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('temple-route.png') });
  await map
    .getByRole('region', { name: 'Rootbound Temple', exact: true })
    .getByRole('button', { name: 'Navigate to', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Stop navigation', exact: true })).toBeVisible();
});

test('a restored sanctuary keeps its released seal and usable local map on a narrow screen', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const save = snapshot([
    'choir.met-mira',
    'choir.root-beast-defeated',
    'choir.east-gate',
    'choir.east-seal',
  ]);
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
    },
    { key: saveKey, value: save },
  );
  await page.goto('/play/demo?expedition=mosswild&forest=temple-interior');
  await ready(page);
  await expect(page.locator('main.rpg-page')).toHaveAttribute(
    'data-temple-area',
    'temple-interior',
  );
  const book = await journal(page);
  await expect(
    book.getByRole('heading', { name: 'Release the moon seal', exact: true }),
  ).toBeVisible();
  await book.getByRole('button', { name: 'Show on map' }).click();
  await expect(page.getByRole('dialog', { name: /atlas$/ })).toBeVisible();
  const box = await page.getByRole('dialog', { name: /atlas$/ }).boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath('sanctuary-mobile-map.png') });
  await page.getByRole('button', { name: 'Back to exploring', exact: true }).click();
  await page.reload();
  await ready(page);
  const restored = await journal(page);
  await expect(
    restored.getByRole('heading', { name: 'Release the moon seal', exact: true }),
  ).toBeVisible();
});

test('returning the notes previews the courtyard rather than marking a point inside the sanctuary', async ({
  page,
}) => {
  const save = snapshot([
    'choir.met-mira',
    'choir.root-beast-defeated',
    'choir.west-gate',
    'choir.east-gate',
    'choir.west-seal',
    'choir.east-seal',
    'choir.warden-defeated',
    'choir.keeper-freed',
    'choir.notes',
  ]);
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: saveKey,
    value: save,
  });
  await page.goto('/play/demo?expedition=mosswild&forest=temple-interior');
  await ready(page);
  const book = await journal(page);
  await expect(
    book.getByRole('heading', { name: 'Return the notes to Mira', exact: true }),
  ).toBeVisible();
  await book.getByRole('button', { name: 'Show on map' }).click();
  const map = page.getByRole('dialog', { name: 'Mosswild Forest', exact: true });
  await expect(map).toBeVisible();
  await expect(map.getByRole('button', { name: /Rootbound Reach,/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await map.getByRole('button', { name: 'Journey', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Journey', exact: true })
    .getByRole('button', { name: 'Guide me' })
    .click();
  await expect(page.getByRole('button', { name: 'Stop navigation', exact: true })).toBeVisible();
  await expect(page.locator('.rpg-navigation-hud')).toContainText('Rootbound Temple');
});
