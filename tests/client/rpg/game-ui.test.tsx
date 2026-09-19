import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdventureJourney } from '../../../src/features/rpg/adventure/journey';
import { AdventureHud } from '../../../src/features/rpg/demo/AdventureHud';
import { PlayerHud } from '../../../src/features/rpg/ui/PlayerHud';
import { DialoguePanel } from '../../../src/features/rpg/ui/DialoguePanel';
import { getRpgSample } from '../../../src/features/rpg/sample-worlds';

const status = () => new AdventureJourney().supplies.status();

describe('game interface', () => {
  it('shows XP within the current level and opens appearance/inventory through their existing actions', () => {
    const appearance = vi.fn(),
      inventory = vi.fn();
    render(
      <PlayerHud
        name="Rowan"
        appearance="rowan"
        status={{ ...status(), level: 2, experience: 65, nextLevel: 100, health: 50 }}
        onAppearance={appearance}
        onInventory={inventory}
      />,
    );
    const xp = screen.getByRole('progressbar', { name: 'Level experience' });
    expect(xp).toHaveAttribute('value', '35');
    expect(xp).toHaveAttribute('max', '70');
    expect(screen.getByLabelText('Health 50 of 100')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Change appearance/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Open inventory' }));
    expect(appearance).toHaveBeenCalledOnce();
    expect(inventory).toHaveBeenCalledOnce();
  });

  it('does not invent progression when the world has no adventure state', () => {
    render(
      <PlayerHud name="Rowan" appearance="rowan" onAppearance={vi.fn()} onInventory={vi.fn()} />,
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open inventory' })).not.toBeInTheDocument();
    expect(screen.getByText('Traveler')).toBeVisible();
  });

  it('keeps ability selection separate from the existing melee control and respects Tide unlock', () => {
    const spell = vi.fn(),
      melee = vi.fn();
    const props = { onAttack: vi.fn(), onHeal: vi.fn(), onSpell: spell, onMelee: melee };
    const view = render(
      <AdventureHud status={{ ...status(), level: 15, combatMode: 'fire' }} {...props} />,
    );
    expect(screen.getByRole('button', { name: /Tide/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Locked ability slot 3' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Locked ability slot 4' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Ember/ }));
    expect(spell).toHaveBeenCalledWith('fire');
    view.rerender(
      <AdventureHud
        status={{ ...status(), level: 25, waterUnlocked: true, combatMode: 'water' }}
        {...props}
      />,
    );
    expect(screen.getByRole('button', { name: /Tide/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Tide/ }));
    expect(spell).toHaveBeenLastCalledWith('water');
    fireEvent.click(screen.getByRole('button', { name: /Practice sword/ }));
    expect(melee).toHaveBeenCalledOnce();
  });

  it('renders existing dialogue lines and preserves advance/leave callbacks', () => {
    const npc = getRpgSample('village').npcs[0]!;
    const advance = vi.fn(),
      close = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    render(
      <DialoguePanel
        open
        dialogue={{ name: npc.name, role: npc.role, lines: npc.lines, appearance: npc.appearance }}
        line={0}
        advanceRef={ref}
        onAdvance={advance}
        onClose={close}
      />,
    );
    expect(screen.getByRole('dialog', { name: npc.name })).toBeVisible();
    expect(screen.getByText(npc.lines[0]!)).toBeVisible();
    expect(ref.current).toBe(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(ref.current!);
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(advance).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('supports keyboard navigation of supplied choices without advancing the story itself', () => {
    const choose = vi.fn(),
      advance = vi.fn();
    render(
      <DialoguePanel
        open
        dialogue={{ name: 'Mira', role: 'Village keeper', lines: ['Which way?'] }}
        line={0}
        onAdvance={advance}
        onClose={vi.fn()}
        choices={[
          { id: 'trail', label: 'Follow the trail.', onSelect: choose },
          { id: 'village', label: 'Return to the village.', onSelect: vi.fn() },
        ]}
      />,
    );
    const trail = screen.getByRole('button', { name: 'Follow the trail.' });
    const village = screen.getByRole('button', { name: 'Return to the village.' });
    trail.focus();
    fireEvent.keyDown(trail, { key: 'ArrowDown' });
    expect(village).toHaveFocus();
    fireEvent.keyDown(village, { key: 'ArrowDown' });
    expect(trail).toHaveFocus();
    fireEvent.click(trail);
    expect(choose).toHaveBeenCalledOnce();
    expect(advance).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Until next time' })).not.toBeInTheDocument();
  });
});
