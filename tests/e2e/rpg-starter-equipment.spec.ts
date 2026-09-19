import { expect, test, type Page } from '@playwright/test';
import { experienceForLevel } from '../../src/domain/adventure/progression';

async function loadOldSave(page: Page, level = 1, forest = false) {
  await page.addInitScript((experience) => {
    const key = 'dmap:forest-journey:v1:preview';
    if (localStorage.getItem(key)) return;
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        traveler: {
          inventory: {},
          progression: {
            version: 1,
            experience,
            ownedWeaponIds: ['sword-0'],
            equippedWeaponId: 'sword-0',
          },
          health: 100,
          herbs: 0,
          spell: 'fire',
          combatMode: 'melee',
        },
        story: [],
        visited: [],
        discovered: [],
        areas: [],
      }),
    );
  }, experienceForLevel(level));
  await page.goto(`/play/demo?expedition=mosswild${forest ? '&forest=verge' : ''}`);
  await expect(page.locator('canvas')).toHaveAttribute('data-rpg-ready', 'true', {
    timeout: 60_000,
  });
  await expect(page.locator('.rpg-stage[inert]')).toHaveCount(0);
}

test('upgrades a sword-only save, equips each starter, and keeps the choice after reload', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await loadOldSave(page);
  await page.getByRole('button', { name: 'Open inventory' }).click();
  const inventory = page.getByRole('dialog', { name: 'Inventory', exact: true });
  await expect(inventory.getByText(/4 weapons owned/)).toBeVisible();
  for (const [family, name] of [
    ['Axes', 'Practice axe'],
    ['Spears', 'Practice spear'],
    ['Staves', 'Practice staff'],
  ]) {
    await inventory.getByRole('tab', { name: family }).click();
    await inventory.getByRole('button', { name: `Equip ${name}` }).click();
    await expect(inventory.getByRole('button', { name: 'Equipped', exact: true })).toBeDisabled();
    await expect(inventory.getByRole('status')).toHaveText(`${name} equipped.`);
  }
  await page.screenshot({ path: info.outputPath('starter-staff-desktop.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('canvas')).toBeFocused();
  await page.reload();
  await expect(page.locator('canvas')).toHaveAttribute('data-rpg-ready', 'true', {
    timeout: 60_000,
  });
  await page.getByRole('button', { name: 'Open inventory' }).click();
  await expect(inventory.getByRole('tab', { name: 'Staves' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(inventory.getByRole('heading', { name: 'Practice staff' })).toBeVisible();
  await expect(inventory.getByRole('button', { name: 'Equipped', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('shows Ember ready at 10, Tide locked until 16, and usable inventory at 390px', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await loadOldSave(page, 10, true);
  await expect(page.getByRole('button', { name: 'Ember · Ready', exact: true })).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Tide · Unlocks at level 16', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Open inventory' }).click();
  const inventory = page.getByRole('dialog', { name: 'Inventory', exact: true });
  await inventory.getByRole('tab', { name: 'Spears' }).click();
  await inventory.getByRole('button', { name: 'Equip Practice spear' }).click();
  await expect(inventory.getByRole('status')).toHaveText('Practice spear equipped.');
  const bounds = (await inventory.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  await expect(inventory.getByRole('button', { name: 'Close inventory' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('starter-spear-mobile.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('canvas')).toBeFocused();
});

test('makes Tide selectable at exactly level 16', async ({ page }) => {
  await loadOldSave(page, 16, true);
  const tide = page.getByRole('button', { name: 'Tide · Ready', exact: true });
  await expect(tide).toBeEnabled();
  await tide.click();
  await expect(tide).toHaveAttribute('aria-pressed', 'true');
});
