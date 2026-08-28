import {
  parseDiscordSourceConfig,
  parseSyncAuthConfig,
  runtimeOnlySchema,
  type DiscordSourceConfig,
  type SyncAuthConfig,
} from './schema';

export interface RuntimeConfig extends DiscordSourceConfig, SyncAuthConfig {
  mapSlug: string;
  snapshotIdSecret: Uint8Array;
  snapshots: KVNamespace;
}

const base64UrlSecretPattern = /^[A-Za-z0-9_-]{43}$/;

export function decodeBase64UrlSecret(value: string): Uint8Array {
  if (
    !base64UrlSecretPattern.test(value) ||
    value.startsWith('enter-') ||
    value.startsWith('generate-')
  ) {
    throw new Error('CONFIG_INVALID');
  }

  try {
    const decoded = atob(`${value.replace(/-/g, '+').replace(/_/g, '/')}=`);
    if (decoded.length !== 32) throw new Error('CONFIG_INVALID');
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    throw new Error('CONFIG_INVALID');
  }
}

export function parseRuntimeConfig(env: Env): RuntimeConfig {
  const source = parseDiscordSourceConfig(env);
  const auth = parseSyncAuthConfig(env);
  const parsed = runtimeOnlySchema.safeParse(env);
  if (
    !parsed.success ||
    new Set([source.botToken, auth.syncSecret, parsed.data.SNAPSHOT_ID_SECRET]).size !== 3
  ) {
    throw new Error('CONFIG_INVALID');
  }
  if (
    typeof env.MAP_SNAPSHOTS?.get !== 'function' ||
    typeof env.MAP_SNAPSHOTS?.put !== 'function'
  ) {
    throw new Error('CONFIG_INVALID');
  }
  return {
    ...source,
    ...auth,
    mapSlug: parsed.data.MAP_SLUG,
    snapshotIdSecret: decodeBase64UrlSecret(parsed.data.SNAPSHOT_ID_SECRET),
    snapshots: env.MAP_SNAPSHOTS,
  };
}
