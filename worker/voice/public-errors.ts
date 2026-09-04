import type { GatewayCommandErrorCode } from '../../src/domain/voice/protocol';

export interface PublicVoiceError {
  code:
    | 'VOICE_NOT_CONNECTED'
    | 'VOICE_ROOM_NOT_FOUND'
    | 'VOICE_ROOM_FORBIDDEN'
    | 'BOT_VOICE_PERMISSION_REQUIRED'
    | 'VOICE_GATEWAY_UNAVAILABLE'
    | 'VOICE_ACTION_RATE_LIMITED'
    | 'VOICE_ACTION_FAILED';
  status: number;
}

const PUBLIC_ERROR_BY_GATEWAY_CODE = {
  NOT_CONNECTED: { code: 'VOICE_NOT_CONNECTED', status: 409 },
  CHANNEL_NOT_FOUND: { code: 'VOICE_ROOM_NOT_FOUND', status: 409 },
  MEMBER_FORBIDDEN: { code: 'VOICE_ROOM_FORBIDDEN', status: 403 },
  BOT_FORBIDDEN: { code: 'BOT_VOICE_PERMISSION_REQUIRED', status: 409 },
  RATE_LIMITED: { code: 'VOICE_ACTION_RATE_LIMITED', status: 503 },
  GUILD_NOT_FOUND: { code: 'VOICE_ACTION_FAILED', status: 502 },
  MEMBER_NOT_FOUND: { code: 'VOICE_ACTION_FAILED', status: 502 },
  GATEWAY_UNAVAILABLE: { code: 'VOICE_GATEWAY_UNAVAILABLE', status: 503 },
  DISCORD_ERROR: { code: 'VOICE_ACTION_FAILED', status: 502 },
} as const satisfies Record<GatewayCommandErrorCode, PublicVoiceError>;

export function publicVoiceErrorFor(code: GatewayCommandErrorCode): PublicVoiceError {
  return PUBLIC_ERROR_BY_GATEWAY_CODE[code];
}
