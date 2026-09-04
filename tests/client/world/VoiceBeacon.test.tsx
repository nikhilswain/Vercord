import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { MapRoom } from '../../../src/domain/map/snapshot';
import type { WorldVoiceState } from '../../../src/domain/voice/state';
import { VoiceBeacon } from '../../../src/features/world/VoiceBeacon';

const room: MapRoom = {
  key: `c_${'a'.repeat(43)}`,
  label: 'Campfire',
  type: 'voice',
  order: 0,
};

function connectedState(): WorldVoiceState {
  return {
    service: 'online',
    voiceState: {
      serviceSessionId: '916bd62d-9144-4fa2-8f18-4616e2746598',
      revision: 2,
      channelKey: room.key,
      selfMute: false,
      selfDeaf: false,
      serverMute: false,
      serverDeaf: false,
      suppress: false,
    },
    pending: null,
    error: null,
    notice: null,
  };
}

describe('VoiceBeacon', () => {
  it('offers return and confirmed disconnect when the member left their call room', async () => {
    const onDisconnect = vi.fn(async () => null);
    const onReturn = vi.fn();
    render(
      <VoiceBeacon
        state={connectedState()}
        currentRoom={null}
        connectedRoom={room}
        onDisconnect={onDisconnect}
        onReturn={onReturn}
        onDismissNotice={() => undefined}
      />,
    );

    expect(screen.getByText('Still in call')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Return to Campfire' }));
    expect(onReturn).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect from voice' }));
    expect(onDisconnect).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps a rejected disconnect open with a retryable error', async () => {
    render(
      <VoiceBeacon
        state={connectedState()}
        currentRoom={null}
        connectedRoom={room}
        onDisconnect={async () => 'Discord rejected this disconnect.'}
        onReturn={() => undefined}
        onDismissNotice={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect from voice' }));
    expect(await screen.findByText('Discord rejected this disconnect.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disconnect from voice' })).toBeEnabled();
  });

  it('explains the manual first join while standing in a voice room', () => {
    render(
      <VoiceBeacon
        state={{ ...connectedState(), voiceState: null }}
        currentRoom={room}
        connectedRoom={null}
        onDisconnect={async () => null}
        onReturn={() => undefined}
        onDismissNotice={() => undefined}
      />,
    );

    expect(screen.getByText(/Join a voice channel in Discord first/u)).toBeInTheDocument();
  });
});
