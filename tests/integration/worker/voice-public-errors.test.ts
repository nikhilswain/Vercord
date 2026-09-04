import { describe, expect, it } from 'vitest';

import { publicVoiceErrorFor } from '../../../worker/voice/public-errors';

describe('public Discord voice errors', () => {
  it.each([
    ['NOT_CONNECTED', 'VOICE_NOT_CONNECTED', 409],
    ['CHANNEL_NOT_FOUND', 'VOICE_ROOM_NOT_FOUND', 409],
    ['MEMBER_FORBIDDEN', 'VOICE_ROOM_FORBIDDEN', 403],
    ['BOT_FORBIDDEN', 'BOT_VOICE_PERMISSION_REQUIRED', 409],
    ['RATE_LIMITED', 'VOICE_ACTION_RATE_LIMITED', 503],
    ['GUILD_NOT_FOUND', 'VOICE_ACTION_FAILED', 502],
    ['MEMBER_NOT_FOUND', 'VOICE_ACTION_FAILED', 502],
    ['GATEWAY_UNAVAILABLE', 'VOICE_GATEWAY_UNAVAILABLE', 503],
    ['DISCORD_ERROR', 'VOICE_ACTION_FAILED', 502],
  ] as const)('maps %s to the stable browser contract', (internal, code, status) => {
    expect(publicVoiceErrorFor(internal)).toEqual({ code, status });
  });
});
