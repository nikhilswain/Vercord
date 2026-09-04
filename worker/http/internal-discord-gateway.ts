const secretPattern = /^[A-Za-z0-9_-]{43}$/u;

function secretsMatch(actual: string, expected: string): boolean {
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export function handleInternalDiscordGateway(
  request: Request,
  env: Env,
): Response | Promise<Response> {
  if (request.method !== 'GET') return new Response(null, { status: 405 });
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
    return new Response(null, { status: 426 });
  }

  const expected = env.GATEWAY_BRIDGE_SECRET;
  if (typeof expected !== 'string' || !secretPattern.test(expected)) {
    return new Response(null, { status: 500 });
  }
  const authorization = request.headers.get('authorization');
  const actual = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!secretsMatch(actual, expected)) return new Response(null, { status: 401 });

  return env.DISCORD_GATEWAY_BRIDGE.getByName('singleton').fetch(
    new Request('https://discord-gateway.dmap/connect', {
      headers: { Upgrade: 'websocket' },
    }),
  );
}
