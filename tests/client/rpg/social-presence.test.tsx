import { act, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PlayersButton } from '../../../src/features/rpg/chat/SocialPanel';
import { GameChatClient } from '../../../src/features/rpg/chat/client';
import type { ChatConnection, ChatTransport } from '../../../src/features/rpg/chat/transport';
import { GLOBAL_CHAT, type ChatEvent } from '../../../src/domain/chat/protocol';

it('uses world presence during chat reconnects, counts self once, and does not invent an offline count', () => {
  let receive: (event: ChatEvent) => void = () => {};
  let status: (state: ChatConnection) => void = () => {};
  const transport: ChatTransport = {
    start(events, connection) {
      receive = events;
      status = connection;
    },
    send: () => true,
    stop() {},
    resume() {},
  };
  const client = new GameChatClient(transport);
  client.start();
  const view = render(<PlayersButton client={client} onOpen={vi.fn()} worldOnlineCount={1} />);
  expect(screen.getByText('1 online')).toBeVisible();
  act(() => status('reconnecting'));
  expect(screen.getByText('1 online')).toBeVisible();
  const self = { id: `p_${'a'.repeat(43)}`, name: 'Rowan' };
  act(() => {
    status('online');
    receive({ type: 'welcome', self, people: [self], rooms: [GLOBAL_CHAT] });
  });
  expect(screen.getByText('1 online')).toBeVisible();
  view.rerender(<PlayersButton client={client} onOpen={vi.fn()} worldOnlineCount={3} />);
  expect(screen.getByText('3 online')).toBeVisible();
  act(() => status('reconnecting'));
  view.rerender(<PlayersButton client={client} onOpen={vi.fn()} />);
  expect(screen.getByText('Connecting…')).toBeVisible();
  expect(screen.queryByText(/online/)).not.toBeInTheDocument();
  client.stop();
});
