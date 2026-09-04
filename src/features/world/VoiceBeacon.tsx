import { useState } from 'react';

import type { MapRoom } from '../../domain/map/snapshot';
import type { WorldVoiceState } from '../../domain/voice/state';
import { ConfirmDialog } from '../../components/ConfirmDialog';

export interface VoiceBeaconProps {
  state: WorldVoiceState;
  currentRoom: MapRoom | null;
  connectedRoom: MapRoom | null;
  onReturn(): void;
  onDisconnect(): Promise<string | null>;
  onDismissNotice(): void;
}

function VoiceIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 9.5v5M12 7v10M16 4.5v15M4 11v2M20 10v4" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m7 7 10 10M17 7 7 17" />
    </svg>
  );
}

function isVoiceRoom(room: MapRoom | null): boolean {
  return room?.type === 'voice' || room?.type === 'stage';
}

export function VoiceBeacon({
  state,
  currentRoom,
  connectedRoom,
  onReturn,
  onDisconnect,
  onDismissNotice,
}: VoiceBeaconProps) {
  const [confirmationRevision, setConfirmationRevision] = useState<number | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const channelKey = state.voiceState?.channelKey ?? null;
  const confirming = channelKey !== null && confirmationRevision === state.voiceState?.revision;
  const connected = channelKey !== null;
  const inConnectedRoom = connected && currentRoom?.key === channelKey;
  const inVoiceRoom = isVoiceRoom(currentRoom);
  const shouldShow =
    state.pending !== null ||
    state.error !== null ||
    state.notice !== null ||
    connected ||
    inVoiceRoom;

  const title = state.pending
    ? state.pending.type === 'move'
      ? 'Moving call…'
      : 'Disconnecting…'
    : state.service === 'offline'
      ? 'Voice sync offline'
      : connected
        ? inConnectedRoom
          ? 'In call'
          : 'Still in call'
        : state.notice
          ? 'Voice disconnected'
          : 'Voice room ready';
  const callLabel = connectedRoom ? `#${connectedRoom.label}` : 'Discord voice';
  const flags = state.voiceState
    ? [
        state.voiceState.selfMute || state.voiceState.serverMute ? 'Muted in Discord' : null,
        state.voiceState.selfDeaf || state.voiceState.serverDeaf ? 'Deafened' : null,
        state.voiceState.suppress ? 'Audience' : null,
      ].filter((flag): flag is string => flag !== null)
    : [];

  const confirmDisconnect = async () => {
    setDisconnecting(true);
    setDisconnectError(null);
    const error = await onDisconnect().catch(
      () => 'Dmap could not update your Discord call. Try again.',
    );
    setDisconnecting(false);
    if (error === null) setConfirmationRevision(null);
    else setDisconnectError(error);
  };

  if (!shouldShow) return null;

  return (
    <>
      <section className="voice-beacon" aria-live="polite" aria-label="Discord voice status">
        <span className="voice-beacon__icon">
          <VoiceIcon />
        </span>
        <div className="voice-beacon__body">
          <strong>{title}</strong>
          <span>
            {state.pending?.type === 'move'
              ? 'Discord is moving you to this room.'
              : state.pending?.type === 'disconnect'
                ? 'Ending your Discord voice connection.'
                : state.service === 'offline'
                  ? 'Dmap cannot read or move your call right now.'
                  : connected
                    ? callLabel
                    : (state.notice ??
                      'Join a voice channel in Discord first, then Dmap can move you.')}
          </span>
          {connected && flags.length > 0 ? (
            <span className="voice-beacon__flags">
              {flags.map((flag) => (
                <span key={flag}>{flag}</span>
              ))}
            </span>
          ) : null}
          {state.error ? (
            <span className="voice-beacon__error" role="alert">
              {state.error}
            </span>
          ) : null}
        </div>
        <div className="voice-beacon__actions">
          {connectedRoom && !inConnectedRoom && state.pending === null ? (
            <button
              type="button"
              onClick={onReturn}
              aria-label={`Return to ${connectedRoom.label}`}
            >
              Return
            </button>
          ) : null}
          {connected && state.service === 'online' && state.pending === null ? (
            <button
              type="button"
              className="voice-beacon__disconnect"
              onClick={() => {
                setDisconnectError(null);
                setConfirmationRevision(state.voiceState?.revision ?? null);
              }}
            >
              Disconnect
            </button>
          ) : null}
          {state.notice && !connected ? (
            <button
              type="button"
              className="voice-beacon__dismiss"
              onClick={onDismissNotice}
              aria-label="Dismiss voice notice"
            >
              <CloseIcon />
            </button>
          ) : null}
        </div>
      </section>

      <ConfirmDialog
        open={confirming}
        title={`Disconnect from ${callLabel}?`}
        confirmLabel="Disconnect from voice"
        busy={disconnecting}
        error={disconnectError}
        onClose={() => {
          if (!disconnecting) setConfirmationRevision(null);
        }}
        onConfirm={confirmDisconnect}
      >
        <p>
          Discord will end this call. Dmap cannot reconnect you automatically. Join a voice channel
          in Discord before using another voice room.
        </p>
      </ConfirmDialog>
    </>
  );
}
