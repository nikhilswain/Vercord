import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { generateWorldDocument } from '../../../src/domain/world/generate';
import type { SavedWorldResponse } from '../../../src/domain/world/protocol';
import type { VoiceApiResponse } from '../../../src/domain/voice/protocol';
import type { RpgVoiceController } from '../../../src/features/rpg/use-rpg-voice';
import type { SavedRpgStatus } from '../../../src/features/rpg/use-saved-rpg-world';

const world = vi.hoisted(() => ({
  status: 'loading' as SavedRpgStatus,
  data: null as SavedWorldResponse | null,
  ready: false,
  voice: null as RpgVoiceController | null,
  move: vi.fn(),
}));
vi.mock('../../../src/features/rpg/RpgPlayPage', () => ({
  RpgPlayPage: () => <div>Playable world</div>,
}));
vi.mock('../../../src/features/rpg/use-saved-rpg-world', () => ({
  useSavedRpgWorld: () => ({ data: world.data, status: world.status, retry: vi.fn() }),
}));
vi.mock('../../../src/features/rpg/use-rpg-presence', () => ({
  useRpgPresence: ({ voice }: { voice: RpgVoiceController }) => {
    world.voice = voice;
    return { ready: world.ready };
  },
}));
vi.mock('../../../src/features/world/voice-api', async (original) => ({
  ...(await original<typeof import('../../../src/features/world/voice-api')>()),
  moveVoice: world.move,
}));
import { RpgSavedPage } from '../../../src/features/rpg/RpgSavedPage';

const response = (channelKey: string, revision: number): VoiceApiResponse => ({
  service: 'online',
  state: {
    channelKey,
    revision,
    serviceSessionId: '916bd62d-9144-4fa2-8f18-4616e2746598',
    selfMute: false,
    selfDeaf: false,
    serverMute: false,
    serverDeaf: false,
    suppress: false,
  },
});
beforeEach(() => {
  world.status = 'loading';
  world.data = null;
  world.ready = false;
  world.move.mockReset();
  history.replaceState(null, '', '/play/123?house=house:0');
});
afterEach(() => history.replaceState(null, '', '/'));

it('keeps the voice session and HTTP lock across loading, and follows only admitted voice/stage houses', async () => {
  const view = render(<RpgSavedPage guildId="123" />);
  expect(screen.getByRole('status').closest('main')).toHaveAttribute('data-ui', 'ornate');
  world.data = {
    document: generateWorldDocument({
      worldId: 'c41ec8ec-0606-47ed-9dcc-87a1c5535ab1',
      themeId: 'village',
      seed: 'e66d39d2-9139-49da-8e41-000000000001',
    }),
    checksum: 'a'.repeat(64),
    createdAt: 1,
    server: { displayName: 'Our town' },
    player: { displayName: 'Traveler', memberKey: `m_${'a'.repeat(43)}` },
    bindings: [
      { landmarkId: 'house:0', rooms: [{ key: 'first', label: 'First', type: 'voice' }] },
      { landmarkId: 'house:1', rooms: [{ key: 'second', label: 'Second', type: 'stage' }] },
      { landmarkId: 'house:2', rooms: [{ key: 'third', label: 'Third', type: 'voice' }] },
      { landmarkId: 'house:3', rooms: [{ key: 'text', label: 'Text', type: 'text' }] },
    ],
  };
  world.status = 'ready';
  world.ready = true;
  view.rerender(<RpgSavedPage guildId="123" />);
  act(() => world.voice!.onVoiceSnapshot(response('first', 1)));
  expect(world.move).not.toHaveBeenCalled();

  let finish!: (value: VoiceApiResponse) => void;
  world.move.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  world.move.mockResolvedValueOnce(response('third', 3));
  const enter = (house: number) => {
    world.status = 'loading';
    world.ready = false;
    act(() => {
      history.pushState(null, '', `/play/123?house=house:${house}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
  };
  const admit = () => {
    world.status = 'ready';
    world.ready = true;
    view.rerender(<RpgSavedPage guildId="123" />);
  };
  enter(1);
  expect(world.voice!.state.voiceState?.channelKey).toBe('first');
  expect(world.move).not.toHaveBeenCalled();
  world.status = 'ready';
  view.rerender(<RpgSavedPage guildId="123" />);
  expect(world.move).not.toHaveBeenCalled(); // Fetch completed; socket has not admitted this house.
  admit();
  expect(world.move).toHaveBeenCalledExactlyOnceWith('123', 'second');
  act(() => world.voice!.onVoiceSnapshot(response('second', 2)));
  enter(2);
  admit();
  expect(world.move).toHaveBeenCalledTimes(1); // Live confirmation must not release the HTTP lock.
  await act(async () => finish(response('second', 2)));
  await waitFor(() => expect(world.voice!.state.voiceState?.channelKey).toBe('third'));
  expect(world.move.mock.calls).toEqual([
    ['123', 'second'],
    ['123', 'third'],
  ]);
  enter(3);
  admit();
  expect(world.move).toHaveBeenCalledTimes(2);
});
