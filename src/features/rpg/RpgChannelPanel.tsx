import type { MapRoom } from '../../domain/map/snapshot';
import type { MessageHistory, RoomMessage } from '../../domain/messages/protocol';
import type {
  MessageSendOutcome,
  WorldPresenceConnection,
} from '../world/presence/world-presence-client';
import { RoomChat } from '../world/RoomChat';
import { VoiceBeacon } from '../world/VoiceBeacon';
import { discordVoiceJoinHref } from '../world/voice-api';
import type { RpgVoiceController } from './use-rpg-voice';

import './rpg-channel.css';

export interface RpgVoiceStatusProps {
  guildId: string;
  currentRoom: MapRoom | null;
  connectedRoom: MapRoom | null;
  voice: RpgVoiceController;
  onReturn(): void;
  className?: string;
}

export function RpgVoiceStatus({
  guildId,
  currentRoom,
  connectedRoom,
  voice,
  onReturn,
  className = '',
}: RpgVoiceStatusProps) {
  const voiceRoom = currentRoom?.type === 'voice' || currentRoom?.type === 'stage';
  return (
    <div className={`rpg-voice-status ${className}`}>
      <VoiceBeacon
        key={`${guildId}:${voice.state.voiceState?.serviceSessionId ?? 'checking'}`}
        state={voice.state}
        currentRoom={currentRoom}
        connectedRoom={connectedRoom}
        joinAppHref={voiceRoom ? discordVoiceJoinHref(guildId, currentRoom.key, 'app') : null}
        joinWebHref={voiceRoom ? discordVoiceJoinHref(guildId, currentRoom.key, 'web') : null}
        onReturn={onReturn}
        onDisconnect={voice.disconnect}
        onDismissNotice={voice.dismissNotice}
      />
    </div>
  );
}

export interface RpgChannelPanelProps {
  guildId: string;
  room: MapRoom;
  connection: WorldPresenceConnection;
  liveMessage: RoomMessage | null;
  readMessages(roomKey: string): Promise<MessageHistory>;
  sendMessage(roomKey: string, content: string): Promise<MessageSendOutcome>;
  voice: RpgVoiceController;
  connectedRoom?: MapRoom | null;
  onReturnToCall?(): void;
}

/** The owning town supplies the Dialog and the latest authorized channel projection. */
export function RpgChannelPanel({
  guildId,
  room,
  connection,
  liveMessage,
  readMessages,
  sendMessage,
  voice,
  connectedRoom = null,
  onReturnToCall,
}: RpgChannelPanelProps) {
  const messagesSupported = room.type === 'text' || room.type === 'announcement';
  const voiceSupported = room.type === 'voice' || room.type === 'stage';
  const connectedKey = voice.state.voiceState?.channelKey;
  const moveAvailable = voiceSupported && connectedKey != null && connectedKey !== room.key;
  return (
    <div className="rpg-channel-panel">
      {messagesSupported ? (
        <RoomChat
          key={`${guildId}:${room.key}`}
          roomKey={room.key}
          roomLabel={room.label}
          connection={connection}
          liveMessage={liveMessage}
          readMessages={readMessages}
          sendMessage={sendMessage}
        />
      ) : voiceSupported ? (
        <>
          <RpgVoiceStatus
            guildId={guildId}
            currentRoom={room}
            connectedRoom={onReturnToCall ? connectedRoom : null}
            voice={voice}
            onReturn={onReturnToCall ?? (() => undefined)}
          />
          {moveAvailable ? (
            <div className="rpg-channel-panel__call-action">
              <p>Your active call follows you into voice houses.</p>
              <button
                type="button"
                className="rpg-button"
                disabled={
                  connection !== 'online' ||
                  voice.state.service !== 'online' ||
                  voice.state.pending !== null
                }
                onClick={() => void voice.move(room.key)}
              >
                Retry voice switch
              </button>
            </div>
          ) : null}
          {room.type === 'stage' ? (
            <p className="rpg-channel-panel__note">
              Manage speaking and audience controls in Discord.
            </p>
          ) : null}
        </>
      ) : (
        <p className="rpg-channel-panel__note">
          {room.type === 'forum' || room.type === 'media'
            ? 'Open this channel in Discord to browse posts and replies.'
            : 'Open this channel in Discord to use its available features.'}
        </p>
      )}
    </div>
  );
}
