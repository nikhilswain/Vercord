import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { TownHallBoard } from '../../../src/features/rpg/town-hall/TownHallBoard';
import { GameChatClient } from '../../../src/features/rpg/chat/client';
import type { ChatConnection, ChatTransport } from '../../../src/features/rpg/chat/transport';
import { GLOBAL_CHAT, type ChatEvent } from '../../../src/domain/chat/protocol';
import type { RpgUiState } from '../../../src/features/rpg/types';

it('uses the live authorized register, disables stale messaging, and restores the correct selected conversation', () => {
  let receive: (event: ChatEvent) => void = () => {};
  let connection: (status: ChatConnection) => void = () => {};
  const transport: ChatTransport = {
    start(events, status) {
      receive = events;
      connection = status;
    },
    send: () => true,
    stop() {},
    resume() {},
  };
  const client = new GameChatClient(transport);
  client.start();
  const ui: RpgUiState = {
    theme: 'village',
    place: 'Town Hall',
    nearby: null,
    position: { x: 512, y: 748 },
    zoom: 1,
  };
  const props = {
    client,
    ui,
    playerName: 'Rowan',
    onClose: vi.fn(),
    onJourney: vi.fn(),
    onInventory: vi.fn(),
    onShowObjective: vi.fn(),
    onMessage: vi.fn(),
    onBoard: vi.fn(),
  };
  const view = render(<TownHallBoard {...props} board="hall:travelers" />);
  expect(screen.getByRole('status')).toHaveTextContent('Connecting');
  const self = { id: `p_${'a'.repeat(43)}`, name: 'Rowan' };
  const peer = {
    id: `p_${'b'.repeat(43)}`,
    name: '<b>Wren</b>',
    area: 'Town Hall',
    status: 'online' as const,
  };
  act(() => {
    connection('online');
    receive({ type: 'welcome', self, people: [self, peer], rooms: [GLOBAL_CHAT] });
  });
  fireEvent.click(screen.getByRole('button', { name: 'Message <b>Wren</b>' }));
  expect(props.onMessage).toHaveBeenCalledWith(peer.id);
  expect(screen.getByText('<b>Wren</b>')).toBeVisible();
  act(() => connection('reconnecting'));
  expect(screen.getByRole('button', { name: 'Message <b>Wren</b>' })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('last seen online');
  view.rerender(<TownHallBoard {...props} board="hall:requests" />);
  expect(screen.getByRole('heading', { name: 'No commissions posted' })).toBeVisible();
  expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Read expedition notices' }));
  expect(props.onBoard).toHaveBeenCalledWith('hall:expeditions');
  expect(props.onJourney).not.toHaveBeenCalled();
  client.stop();
});
