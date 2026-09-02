import { describe, expect, it } from 'vitest';

import { parseDiscordSourceConfig, parseSyncAuthConfig } from '../../../worker/config/schema';
import { decodeBase64UrlSecret, parseRuntimeConfig } from '../../../worker/config/runtime';

const SYNC_SECRET = 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE';
const ID_SECRET = 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI';
const INVALID_ALPHABET_SECRET = `${ID_SECRET.slice(0, 42)}+`;
const BOT_TOKEN = 'test.bot.token.never.real.0001';
const GUILD_ID = '100000000000000001';

function validEnv(overrides: Partial<Env> = {}): Env {
  return {
    DISCORD_BOT_TOKEN: BOT_TOKEN,
    DISCORD_GUILD_ID: GUILD_ID,
    MAP_SLUG: 'test-map',
    SYNC_SECRET,
    PUBLICATION_ALLOWLIST_JSON: '{"categoryIds":[],"channelIds":[]}',
    SNAPSHOT_ID_SECRET: ID_SECRET,
    DISCORD_CLIENT_ID: '100000000000000002',
    DISCORD_CLIENT_SECRET: 'test-client-secret-never-real',
    AUTH_SESSION_SECRET: 'AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwM',
    MAP_SNAPSHOTS: {
      get: async () => null,
      put: async () => undefined,
    } as unknown as KVNamespace,
    AUTH_DB: {} as D1Database,
    WORLD_PRESENCE: {} as Env['WORLD_PRESENCE'],
    ...overrides,
  };
}

function expectConfigInvalid(action: () => unknown): void {
  let thrown: unknown;

  try {
    action();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(Error);
  expect((thrown as Error).message).toBe('CONFIG_INVALID');
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

  it('accepts record-shaped verifier input and fails closed for unknown values', () => {
    expectConfigInvalid(() =>
      parseDiscordSourceConfig({
        UNRELATED_TEST_PROPERTY: 'test-only',
      }),
    );
  });

  it.each([
    ['DISCORD_GUILD_ID', '01'],
    ['DISCORD_GUILD_ID', '18446744073709551616'],
    ['MAP_SLUG', 'Bad Slug'],
    ['SYNC_SECRET', 'short'],
    ['SNAPSHOT_ID_SECRET', SYNC_SECRET],
  ])('rejects invalid %s configuration', (name, value) => {
    expectConfigInvalid(() => parseRuntimeConfig(validEnv({ [name]: value } as Partial<Env>)));
  });

  it.each([
    ['SYNC_SECRET', SYNC_SECRET],
    ['SNAPSHOT_ID_SECRET', ID_SECRET],
  ])('rejects a bot token reused as %s', (_name, value) => {
    expectConfigInvalid(() => parseRuntimeConfig(validEnv({ DISCORD_BOT_TOKEN: value })));
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
    ['DISCORD_GUILD_ID', 'not-a-snowflake'],
  ])('rejects invalid Discord source %s', (name, value) => {
    expectConfigInvalid(() =>
      parseDiscordSourceConfig({
        DISCORD_GUILD_ID: GUILD_ID,
        DISCORD_BOT_TOKEN: BOT_TOKEN,
        [name]: value,
      }),
    );
  });

  it.each([
    'generate-a-long-random-local-secret',
    `${SYNC_SECRET}=`,
    SYNC_SECRET.slice(1),
    `generate-${'a'.repeat(34)}`,
  ])('rejects invalid sync authorization secret', (syncSecret) => {
    expectConfigInvalid(() => parseSyncAuthConfig({ SYNC_SECRET: syncSecret }));
  });

  it.each([
    ['parseSyncAuthConfig', () => parseSyncAuthConfig({ SYNC_SECRET: INVALID_ALPHABET_SECRET })],
    [
      'parseRuntimeConfig snapshot ID secret',
      () => parseRuntimeConfig(validEnv({ SNAPSHOT_ID_SECRET: INVALID_ALPHABET_SECRET })),
    ],
    ['decodeBase64UrlSecret', () => decodeBase64UrlSecret(INVALID_ALPHABET_SECRET)],
  ])('rejects a 43-character invalid-alphabet secret through %s', (_path, action) => {
    expectConfigInvalid(action);
  });

  it.each([
    ['SYNC_SECRET', 'enter-a-secret'],
    ['SNAPSHOT_ID_SECRET', 'generate-a-32-byte-base64url-secret'],
    ['SNAPSHOT_ID_SECRET', BOT_TOKEN],
  ])('rejects placeholder or malformed runtime secret %s', (name, value) => {
    expectConfigInvalid(() => parseRuntimeConfig(validEnv({ [name]: value } as Partial<Env>)));
  });

  it('rejects matching independent secrets', () => {
    expectConfigInvalid(() => parseRuntimeConfig(validEnv({ SNAPSHOT_ID_SECRET: SYNC_SECRET })));
  });

  it.each([
    ['DISCORD_BOT_TOKEN', 'x'.repeat(513)],
    ['DISCORD_BOT_TOKEN', `generate-${'a'.repeat(34)}`],
    ['MAP_SLUG', 'ab'],
    ['MAP_SLUG', 'a'.repeat(64)],
    ['MAP_SLUG', '-test-map'],
    ['MAP_SLUG', 'test-map-'],
    ['MAP_SLUG', 'test--map'],
    ['SYNC_SECRET', `enter-${'a'.repeat(37)}`],
    ['SNAPSHOT_ID_SECRET', `generate-${'a'.repeat(34)}`],
  ])('rejects the %s fail-closed boundary', (name, value) => {
    expectConfigInvalid(() => parseRuntimeConfig(validEnv({ [name]: value } as Partial<Env>)));
  });

  it.each([{}, { get: async () => null }, { put: async () => undefined }])(
    'rejects a malformed MAP_SNAPSHOTS binding',
    (snapshots) => {
      expectConfigInvalid(() =>
        parseRuntimeConfig(validEnv({ MAP_SNAPSHOTS: snapshots as unknown as KVNamespace })),
      );
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
    expectConfigInvalid(() => decodeBase64UrlSecret(secret));
  });
});
