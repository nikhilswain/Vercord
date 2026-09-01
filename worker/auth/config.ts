import { decodeBase64UrlSecret } from '../config/runtime';

export interface AuthConfig {
  clientId: string;
  clientSecret: string;
  guildId: string;
  mapSlug: string;
  sessionSecret: Uint8Array;
  database: D1Database;
}

const snowflakePattern = /^[1-9]\d{0,19}$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isConfiguredSecret(value: unknown, minimumLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length >= minimumLength &&
    value.length <= 512 &&
    !value.startsWith('enter-') &&
    !value.startsWith('generate-')
  );
}

export function parseAuthConfig(env: Env): AuthConfig {
  if (
    !snowflakePattern.test(env.DISCORD_CLIENT_ID ?? '') ||
    !isConfiguredSecret(env.DISCORD_CLIENT_SECRET, 20) ||
    !snowflakePattern.test(env.DISCORD_GUILD_ID ?? '') ||
    typeof env.MAP_SLUG !== 'string' ||
    env.MAP_SLUG.length < 3 ||
    env.MAP_SLUG.length > 63 ||
    !slugPattern.test(env.MAP_SLUG) ||
    typeof env.AUTH_DB?.prepare !== 'function'
  ) {
    throw new Error('AUTH_CONFIG_INVALID');
  }

  return {
    clientId: env.DISCORD_CLIENT_ID,
    clientSecret: env.DISCORD_CLIENT_SECRET,
    guildId: env.DISCORD_GUILD_ID,
    mapSlug: env.MAP_SLUG,
    sessionSecret: decodeBase64UrlSecret(env.AUTH_SESSION_SECRET),
    database: env.AUTH_DB,
  };
}
