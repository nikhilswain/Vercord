import { voiceApiResponseSchema, type VoiceApiResponse } from '../../domain/voice/protocol';

export class VoiceApiError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = 'VoiceApiError';
  }
}

async function voiceRequest(
  guildId: string,
  path: string,
  init: RequestInit,
): Promise<VoiceApiResponse> {
  const response = await fetch(`/api/auth/guilds/${encodeURIComponent(guildId)}/voice${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...init.headers },
  });
  const value = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const errorValue =
      typeof value === 'object' && value !== null ? Reflect.get(value, 'error') : null;
    const code =
      typeof errorValue === 'object' && errorValue !== null
        ? Reflect.get(errorValue, 'code')
        : null;
    throw new VoiceApiError(typeof code === 'string' ? code : 'VOICE_UNAVAILABLE');
  }
  const parsed = voiceApiResponseSchema.safeParse(value);
  if (!parsed.success) throw new VoiceApiError('VOICE_RESPONSE_INVALID');
  return parsed.data;
}

export function fetchVoiceState(guildId: string, signal?: AbortSignal): Promise<VoiceApiResponse> {
  return voiceRequest(guildId, '', { method: 'GET', signal });
}

export function moveVoice(guildId: string, roomKey: string): Promise<VoiceApiResponse> {
  return voiceRequest(guildId, '/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomKey }),
  });
}

export function disconnectVoice(guildId: string): Promise<VoiceApiResponse> {
  return voiceRequest(guildId, '/disconnect', { method: 'POST' });
}

export function voiceErrorMessage(error: unknown): string {
  const code = error instanceof VoiceApiError ? error.code : 'VOICE_UNAVAILABLE';
  switch (code) {
    case 'VOICE_NOT_CONNECTED':
      return 'Join a voice channel in Discord first.';
    case 'BOT_VOICE_PERMISSION_REQUIRED':
      return 'The Dmap bot does not have permission to move you there.';
    case 'VOICE_ROOM_FORBIDDEN':
      return 'You no longer have permission to join that voice room.';
    case 'VOICE_ROOM_NOT_FOUND':
      return 'That voice room is no longer available. Sync the map and try again.';
    case 'VOICE_GATEWAY_UNAVAILABLE':
      return 'Voice sync is offline. Your Discord call was not changed.';
    case 'VOICE_ACTION_TIMEOUT':
      return 'Discord did not confirm the change. Check your call before trying again.';
    case 'VOICE_ACTION_RATE_LIMITED':
      return 'Discord is busy. Wait a moment and try again.';
    default:
      return 'Dmap could not update your Discord call. Try again.';
  }
}

export function isVoiceActionTimeout(error: unknown): boolean {
  return error instanceof VoiceApiError && error.code === 'VOICE_ACTION_TIMEOUT';
}
