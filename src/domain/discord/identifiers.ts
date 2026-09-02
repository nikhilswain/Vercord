import type { Snowflake } from './source';

const PREFIX = {
  guild: 'g_',
  channel: 'c_',
  role: 'r_',
  member: 'm_',
  presence: 'p_',
} as const;

export interface IdentifierFactory {
  for(kind: keyof typeof PREFIX, snowflake: Snowflake): Promise<string>;
}

export async function createIdentifierFactory(secret: Uint8Array): Promise<IdentifierFactory> {
  const key = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const cache = new Map<string, Promise<string>>();
  const encoder = new TextEncoder();

  return {
    for(kind, snowflake) {
      const cacheKey = `${kind}:${snowflake}`;
      const existing = cache.get(cacheKey);
      if (existing !== undefined) return existing;

      const identifier = crypto.subtle
        .sign('HMAC', key, encoder.encode(cacheKey))
        .then((digest) => `${PREFIX[kind]}${encodeBase64Url(new Uint8Array(digest))}`);
      cache.set(cacheKey, identifier);
      return identifier;
    },
  };
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
