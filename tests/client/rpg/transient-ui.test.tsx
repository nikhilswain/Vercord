import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RpgDialogue } from '../../../src/features/rpg/types';
import type { RpgConnection } from '../../../src/features/rpg/use-rpg-presence';
import { INITIAL_WORLD_VOICE_STATE } from '../../../src/domain/voice/state';
const runtime = vi.hoisted(() => ({
  key: 'first',
  onDialogue: (() => {}) as (dialogue: RpgDialogue) => void,
  onHouse: undefined as ((landmarkId: string) => void) | undefined,
  blocked: false,
}));
vi.mock('../../../src/features/rpg/character', () => ({
  RPG_APPEARANCES: [{ id: 'rowan', name: 'Rowan', portraitUrl: '/traveler.png' }],
}));
vi.mock('../../../src/features/rpg/use-rpg-game', () => ({
  useRpgGame: (options: {
    onDialogue(dialogue: RpgDialogue): void;
    onHouse?(landmarkId: string): void;
    blocked: boolean;
  }) => {
    runtime.onDialogue = options.onDialogue;
    runtime.onHouse = options.onHouse;
    runtime.blocked = options.blocked;
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
  it('enters a walkable house before opening chat and lists all room members', () => {
    const sample = { ...getRpgSample('village'), sceneId: 'house:0' as const, name: 'Garden chat' };
    const self = {
      id: 'p_self',
      displayName: 'The complete traveler name',
      appearance: 'rowan' as const,
      x: 320,
      y: 400,
      direction: 'down' as const,
      action: 'idle' as const,
      scene: 'house:0' as const,
    };
    const peers = Array.from({ length: 18 }, (_, index) => ({
      ...self,
      id: `p_peer${index}`,
      displayName: `House member ${index}`,
      avatarUrl: index === 0 ? 'https://cdn.discordapp.com/embed/avatars/0.png' : null,
    }));
    const connection: RpgConnection = {
      ready: true,
      connection: 'online',
      onlineCount: 30,
      sync: { state: 'ready' },
      self,
      players: [...peers, { ...self, id: 'p_outdoors', scene: 'overworld' }],
      position: self,
      liveMessage: null,
      updateLocation: vi.fn(),
      setAppearance: vi.fn(),
      readMessages: vi.fn().mockResolvedValue({ messages: [], canRead: true, canSend: true }),
      sendMessage: vi.fn(),
    };
    const onEnterHouse = vi.fn();
    const onTravel = vi.fn();
    const voice = {
      state: INITIAL_WORLD_VOICE_STATE,
      move: vi.fn(),
      disconnect: vi.fn(),
      onVoiceState: vi.fn(),
      onVoiceService: vi.fn(),
      onVoiceSnapshot: vi.fn(),
      dismissNotice: vi.fn(),
    };
    const props = {
      route: { theme: 'village' as const, world: 'village' as const, house: 'house:0' as const },
      sample,
      samples: [sample],
      worldKey: 'town/house:0',
      onTravel,
      server: {
        guildId: '123',
        displayName: 'A town',
        playerName: self.displayName,
        bindings: [
          {
            landmarkId: 'house:0',
            rooms: [{ key: 'room_1', label: 'Garden chat', type: 'text' as const }],
          },
        ],
        onStreet: vi.fn(),
        onEnterHouse,
        connection,
        voice,
      },
    };
    const { rerender } = render(<RpgPlayPage {...props} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(runtime.blocked).toBe(false);
    expect(voice.move).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'In this room · 19' }));
    const roster = screen.getByRole('dialog', { name: /In this room/u });
    expect(within(roster).getByText(self.displayName)).toBeVisible();
    expect(within(roster).getByText('House member 17')).toBeVisible();
    expect(within(roster).queryByText('p_outdoors')).not.toBeInTheDocument();
    expect(runtime.blocked).toBe(true);
    const search = within(roster).getByRole('searchbox', { name: 'Find a traveler' });
    fireEvent.change(search, { target: { value: 'member 17' } });
    expect(within(roster).queryByText('House member 0')).not.toBeInTheDocument();
    fireEvent.click(within(roster).getByRole('button', { name: 'Clear traveler search' }));
    expect(within(roster).getByText('House member 0')).toBeVisible();
    fireEvent.click(within(roster).getByRole('button', { name: 'Back to room' }));
    expect(runtime.blocked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Chat' }));
    expect(screen.getByRole('dialog', { name: '# Garden chat' })).toBeVisible();
    expect(runtime.blocked).toBe(true);
    rerender(<RpgPlayPage {...props} navigationKey="refresh" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Leave house' }));
    expect(onTravel).toHaveBeenCalledWith('return');
    rerender(<RpgPlayPage {...props} route={{ theme: 'village', world: 'village' }} />);
    act(() => runtime.onHouse?.('house:0'));
    expect(onEnterHouse).toHaveBeenCalledWith('house:0');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

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
