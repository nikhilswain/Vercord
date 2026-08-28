import { describe, expect, it } from 'vitest';

import { parseDiscordSourceConfig, parseSyncAuthConfig } from '../../../worker/config/schema';
import { decodeBase64UrlSecret, parseRuntimeConfig } from '../../../worker/config/runtime';

const SYNC_SECRET = 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE';
const ID_SECRET = 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI';
const BOT_TOKEN = 'test.bot.token.never.real.0001';
const GUILD_ID = '100000000000000001';

function validEnv(overrides: Partial<Env> = {}): Env {
  return {
    DISCORD_BOT_TOKEN: BOT_TOKEN,
    DISCORD_GUILD_ID: GUILD_ID,
    MAP_SLUG: 'test-map',
    SYNC_SECRET,
    SNAPSHOT_ID_SECRET: ID_SECRET,
    MAP_SNAPSHOTS: {
      get: async () => null,
      put: async () => undefined,
    } as unknown as KVNamespace,
    ...overrides,
  };
}

describe('Phase 1 configuration', () => {
  it('parses the Discord-only verifier subset', () => {
    expect(
      parseDiscordSourceConfig({
        DISCORD_BOT_TOKEN: BOT_TOKEN,
        DISCORD_GUILD_ID: GUILD_ID,
      }),
    ).toEqual({
      botToken: BOT_TOKEN,
      guildId: GUILD_ID,
    });
  });

  it.each([
    ['DISCORD_GUILD_ID', '01'],
    ['DISCORD_GUILD_ID', '18446744073709551616'],
    ['MAP_SLUG', 'Bad Slug'],
    ['SYNC_SECRET', 'short'],
    ['SNAPSHOT_ID_SECRET', SYNC_SECRET],
  ])('rejects invalid %s configuration', (name, value) => {
    const env = {
      DISCORD_BOT_TOKEN: BOT_TOKEN,
      DISCORD_GUILD_ID: GUILD_ID,
      MAP_SLUG: 'test-map',
      SYNC_SECRET,
      SNAPSHOT_ID_SECRET: ID_SECRET,
      MAP_SNAPSHOTS: {} as unknown as KVNamespace,
      [name]: value,
    } as Env;

    expect(() => parseRuntimeConfig(env)).toThrowError('CONFIG_INVALID');
  });

  it.each([
    ['SYNC_SECRET', SYNC_SECRET],
    ['SNAPSHOT_ID_SECRET', ID_SECRET],
  ])('rejects a bot token reused as %s', (_name, value) => {
    const env = {
      DISCORD_BOT_TOKEN: value,
      DISCORD_GUILD_ID: GUILD_ID,
      MAP_SLUG: 'test-map',
      SYNC_SECRET,
      SNAPSHOT_ID_SECRET: ID_SECRET,
      MAP_SNAPSHOTS: {} as unknown as KVNamespace,
    } as Env;

    expect(() => parseRuntimeConfig(env)).toThrowError('CONFIG_INVALID');
  });

  it('parses the sync secret independently for pre-sync authorization', () => {
    expect(parseSyncAuthConfig({ SYNC_SECRET })).toEqual({ syncSecret: SYNC_SECRET });
  });

  it('returns the complete validated runtime configuration', () => {
    const runtime = parseRuntimeConfig(validEnv());

    expect(runtime.botToken).toBe(BOT_TOKEN);
    expect(runtime.guildId).toBe(GUILD_ID);
    expect(runtime.mapSlug).toBe('test-map');
    expect(runtime.syncSecret).toBe(SYNC_SECRET);
    expect(runtime.snapshotIdSecret).toEqual(new Uint8Array(32).fill(2));
    expect(typeof runtime.snapshots.get).toBe('function');
    expect(typeof runtime.snapshots.put).toBe('function');
  });

  it.each([
    ['DISCORD_BOT_TOKEN', 'short'],
    ['DISCORD_BOT_TOKEN', 'test token with whitespace never real 0001'],
    ['DISCORD_BOT_TOKEN', 'enter-bot-token-in-local-dev-vars'],
    ['DISCORD_GUILD_ID', '0'],
    ['DISCORD_GUILD_ID', '100000000000000000 '],
  ])('rejects invalid Discord source %s', (name, value) => {
    expect(() =>
      parseDiscordSourceConfig({
        DISCORD_GUILD_ID: GUILD_ID,
        DISCORD_BOT_TOKEN: BOT_TOKEN,
        [name]: value,
      }),
    ).toThrowError('CONFIG_INVALID');
  });

  it.each(['generate-a-long-random-local-secret', `${SYNC_SECRET}=`, SYNC_SECRET.slice(1)])(
    'rejects invalid sync authorization secret',
    (syncSecret) => {
      expect(() => parseSyncAuthConfig({ SYNC_SECRET: syncSecret })).toThrowError('CONFIG_INVALID');
    },
  );

  it.each([
    ['SYNC_SECRET', 'enter-a-secret'],
    ['SNAPSHOT_ID_SECRET', 'generate-a-32-byte-base64url-secret'],
    ['SNAPSHOT_ID_SECRET', BOT_TOKEN],
  ])('rejects placeholder or malformed runtime secret %s', (name, value) => {
    expect(() => parseRuntimeConfig(validEnv({ [name]: value } as Partial<Env>))).toThrowError(
      'CONFIG_INVALID',
    );
  });

  it('rejects matching independent secrets', () => {
    expect(() => parseRuntimeConfig(validEnv({ SNAPSHOT_ID_SECRET: SYNC_SECRET }))).toThrowError(
      'CONFIG_INVALID',
    );
  });

  it.each([{}, { get: async () => null }, { put: async () => undefined }])(
    'rejects a malformed MAP_SNAPSHOTS binding',
    (snapshots) => {
      expect(() =>
        parseRuntimeConfig(validEnv({ MAP_SNAPSHOTS: snapshots as unknown as KVNamespace })),
      ).toThrowError('CONFIG_INVALID');
    },
  );

  it('decodes a 43-character base64url secret into 32 bytes', () => {
    expect(decodeBase64UrlSecret(ID_SECRET)).toEqual(new Uint8Array(32).fill(2));
  });

  it.each([
    'not-base64url--------------------------------',
    `${ID_SECRET}=`,
    ID_SECRET.slice(1),
    `enter-${'a'.repeat(37)}`,
  ])('rejects an invalid base64url secret', (secret) => {
    expect(() => decodeBase64UrlSecret(secret)).toThrowError('CONFIG_INVALID');
  });
});
