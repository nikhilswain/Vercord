import { describe, expect, it } from 'vitest';

import {
  gatewayBridgeMessageSchema,
  gatewayCommandSchema,
  voiceStateSchema,
} from '../../../../src/domain/voice/protocol';

const digest = 'A'.repeat(43);
const state = {
  serviceSessionId: '916bd62d-9144-4fa2-8f18-4616e2746598',
  revision: 4,
  channelKey: `c_${digest}`,
  selfMute: false,
  selfDeaf: false,
  serverMute: false,
  serverDeaf: false,
  suppress: false,
};

describe('Discord voice bridge protocol', () => {
  it('accepts a sanitized voice state and rejects unknown or raw Discord fields', () => {
    expect(voiceStateSchema.parse(state)).toEqual(state);
    expect(() => voiceStateSchema.parse({ ...state, channelId: '123456789012345678' })).toThrow();
  });

  it('accepts a bounded voice snapshot addressed only by opaque identifiers', () => {
    const message = {
      type: 'voice-snapshot',
      guildKey: `g_${digest}`,
      serviceSessionId: state.serviceSessionId,
      revision: 4,
      states: [{ presenceId: `p_${digest}`, state }],
    };

    expect(gatewayBridgeMessageSchema.parse(message)).toEqual(message);
  });

  it('rejects malformed commands before they can reach Discord', () => {
    expect(
      gatewayCommandSchema.parse({
        type: 'move',
        requestId: 'de02aad0-9950-4b19-b65a-b4d232c2362e',
        guildId: '123456789012345678',
        userId: '223456789012345678',
        roomKey: `c_${digest}`,
      }),
    ).toMatchObject({ type: 'move' });

    expect(() =>
      gatewayCommandSchema.parse({
        type: 'disconnect',
        requestId: 'not-a-request-id',
        guildId: '123',
        userId: '223456789012345678',
      }),
    ).toThrow();
  });
});
