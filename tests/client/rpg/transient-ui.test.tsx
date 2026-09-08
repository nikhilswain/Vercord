import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RpgDialogue } from '../../../src/features/rpg/types';
const runtime = vi.hoisted(() => ({
  key: 'first',
  onDialogue: (() => {}) as (dialogue: RpgDialogue) => void,
}));
vi.mock('../../../src/features/rpg/character', () => ({
  RPG_APPEARANCES: [{ id: 'rowan', name: 'Rowan', portraitUrl: '/traveler.png' }],
}));
vi.mock('../../../src/features/rpg/use-rpg-game', () => ({
  useRpgGame: (options: { onDialogue(dialogue: RpgDialogue): void }) => {
    runtime.onDialogue = options.onDialogue;
    return {
      hostRef: { current: null },
      canvasRef: { current: null },
      runtimeRef: { current: null },
      canvasKey: runtime.key,
      status: 'ready',
      retry: vi.fn(),
    };
  },
}));
import { RpgPlayPage } from '../../../src/features/rpg/RpgPlayPage';
import { getRpgSample } from '../../../src/features/rpg/sample-worlds';

describe('town navigation overlays', () => {
  it('dismisses a previous street’s dialogue on navigation, refreshed data, and graphics retry', () => {
    const sample = getRpgSample('village');
    const props = {
      route: { theme: 'village' as const, world: 'village' as const },
      sample,
      samples: [sample],
      worldKey: 'town/street',
      onTravel: vi.fn(),
      navigationKey: 'first',
    };
    const { rerender } = render(<RpgPlayPage {...props} />);
    const talk = () =>
      act(() =>
        runtime.onDialogue({
          name: 'Previous street house',
          role: 'Street 2',
          lines: ['A channel house.'],
        }),
      );
    talk();
    expect(screen.getByRole('dialog', { name: 'Previous street house' })).toBeVisible();
    rerender(<RpgPlayPage {...props} navigationKey="back" />);
    expect(screen.queryByRole('dialog', { name: 'Previous street house' })).not.toBeInTheDocument();
    talk();
    const refreshed = { ...sample };
    rerender(<RpgPlayPage {...props} navigationKey="back" sample={refreshed} />);
    expect(screen.queryByRole('dialog', { name: 'Previous street house' })).not.toBeInTheDocument();
    talk();
    runtime.key = 'retry';
    rerender(<RpgPlayPage {...props} navigationKey="back" sample={refreshed} />);
    expect(screen.queryByRole('dialog', { name: 'Previous street house' })).not.toBeInTheDocument();
  });
});
