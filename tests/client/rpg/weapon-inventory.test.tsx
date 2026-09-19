import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { WeaponInventory } from '../../../src/features/rpg/inventory/WeaponInventory';
import { AdventureJourney } from '../../../src/features/rpg/adventure/journey';

it('lets a normal traveler select each starter family and keeps the equipped choice after a reload', () => {
  const journey = new AdventureJourney();
  const onEquip = (id: string) => {
    const result = journey.supplies.equip(id);
    view.rerender(<WeaponInventory status={journey.supplies.status()} onEquip={onEquip} />);
    return result;
  };
  const view = render(<WeaponInventory status={journey.supplies.status()} onEquip={onEquip} />);
  expect(screen.getByText(/4 weapons owned/)).toBeVisible();
  for (const [family, name] of [
    ['Axes', 'Practice axe'],
    ['Spears', 'Practice spear'],
    ['Staves', 'Practice staff'],
  ]) {
    fireEvent.click(screen.getByRole('tab', { name: family }));
    expect(screen.getByRole('heading', { name })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: `Equip ${name}` }));
    expect(screen.getByRole('button', { name: /^Equipped$/ })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(`${name} equipped.`);
  }
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Staves' }), { key: 'Home' });
  expect(screen.getByRole('tab', { name: 'Swords' })).toHaveFocus();
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
  expect(screen.getByRole('button', { name: 'Equip Practice sword' })).toBeEnabled();
  expect(new AdventureJourney({ snapshot: journey.snapshot() }).supplies.status().weaponId).toBe(
    'staff-0',
  );
});
