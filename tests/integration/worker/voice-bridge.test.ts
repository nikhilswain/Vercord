import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { gatewayCommandSchema } from '../../../src/domain/voice/protocol';

const GATEWAY_SECRET = 'AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwM';
const GUILD_KEY = `g_${'a'.repeat(43)}`;

function nextMessage(socket: WebSocket): Promise<MessageEvent> {
  return new Promise((resolve) => socket.addEventListener('message', resolve, { once: true }));
}

describe('Discord Gateway bridge boundary', () => {
  it('requires both a WebSocket upgrade and the shared bearer secret', async () => {
    const plain = await SELF.fetch('https://dmap.test/api/internal/discord-gateway');
    expect(plain.status).toBe(426);

    const unauthenticated = await SELF.fetch('https://dmap.test/api/internal/discord-gateway', {
      headers: { Upgrade: 'websocket' },
    });
    expect(unauthenticated.status).toBe(401);
  });

  it('round-trips a successful disconnect command with a null state', async () => {
    const upgrade = await SELF.fetch('https://dmap.test/api/internal/discord-gateway', {
      headers: {
        Upgrade: 'websocket',
        Authorization: `Bearer ${GATEWAY_SECRET}`,
      },
    });
    expect(upgrade.status).toBe(101);
    const socket = upgrade.webSocket!;
    socket.accept();
    socket.send(
      JSON.stringify({
        type: 'hello',
        protocolVersion: 1,
        serviceSessionId: '916bd62d-9144-4fa2-8f18-4616e2746598',
        guildKeys: [GUILD_KEY],
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 25));

    const requestId = crypto.randomUUID();
    const resultPromise = env.DISCORD_GATEWAY_BRIDGE.getByName('singleton').fetch(
      'https://discord-gateway.dmap/command',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'disconnect',
          requestId,
          guildId: '100000000000000001',
          userId: '100000000000000002',
        }),
      },
    );
    const command = gatewayCommandSchema.parse(
      JSON.parse(String((await nextMessage(socket)).data)) as unknown,
    );
    expect(command).toMatchObject({ type: 'disconnect', requestId });
    socket.send(JSON.stringify({ type: 'command-result', requestId, ok: true, state: null }));

    const response = await resultPromise;
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      type: 'command-result',
      requestId,
      ok: true,
      state: null,
    });
    socket.close(1000, 'Test complete');
  });
});
