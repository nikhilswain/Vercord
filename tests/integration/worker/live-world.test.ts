import { env } from 'cloudflare:test';
import { beforeEach, expect, it, vi } from 'vitest';
import type { WorldView } from '../../../src/domain/channels/protocol';
import type { LiveFrame, LiveRead } from '../../../src/domain/discord/live-protocol';
import { createD1AuthRepository } from '../../../worker/auth/repository';
import * as projection from '../../../worker/channels/projection';
import { sendLiveCommand } from '../../../worker/live-world/bridge-client';
import { LiveWorldCoordinator } from '../../../worker/live-world/coordinator';
import {
  sessionBindingIsCurrent,
  type WorldActor,
} from '../../../worker/live-world/session-access';
import { createD1WorldRepository } from '../../../worker/worlds/repository';
import { createValidatedDiscordSourceFixture, TEST_IDS } from '../../fixtures/discord/guild-source';

vi.mock('../../../worker/live-world/bridge-client', () => ({ sendLiveCommand: vi.fn() }));
const streamId = 'e5c87579-ec50-4325-a4af-7c5927cd94cf';
const actor: WorldActor = {
  guildId: TEST_IDS.guild,
  userId: '300000000000000003',
  sessionHash: 'invented-session',
};
let source = createValidatedDiscordSourceFixture();
const baseline = (userId = actor.userId, sequence = 1): LiveRead => ({
  guildId: actor.guildId,
  cursor: { streamId, sequence },
  source: structuredClone(source),
  member: {
    kind: 'present',
    member: {
      userId,
      roleIds: userId === actor.userId ? [TEST_IDS.botRole] : [],
      pending: false,
      communicationDisabledUntil: null,
    },
  },
});
const frame = (
  content:
    | { type: 'world-source'; source: typeof source }
    | { type: 'world-member'; member: LiveRead['member'] },
  sequence: number,
): LiveFrame => ({
  ...content,
  serviceSessionId: streamId,
  guildKey: `g_${'a'.repeat(43)}`,
  cursor: { streamId, sequence },
});

async function createSession(value: WorldActor): Promise<void> {
  await createD1AuthRepository(env.AUTH_DB).createSession({
    idHash: value.sessionHash,
    userId: value.userId,
    username: 'invented',
    displayName: 'Invented',
    avatarHash: null,
    accessTokenCiphertext: 'invented',
    accessTokenIv: 'invented',
    refreshTokenCiphertext: null,
    refreshTokenIv: null,
    tokenType: 'Bearer',
    scope: 'identify',
    tokenExpiresAt: 2_000_000_000,
    sessionExpiresAt: 2_000_000_000,
    createdAt: 0,
    lastSeenAt: 0,
  });
}

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.mocked(sendLiveCommand).mockReset();
  source = createValidatedDiscordSourceFixture();
  await env.AUTH_DB.exec(
    'CREATE TABLE IF NOT EXISTS sessions (id_hash TEXT PRIMARY KEY,user_id TEXT,username TEXT,display_name TEXT,avatar_hash TEXT,access_token_ciphertext TEXT,access_token_iv TEXT,refresh_token_ciphertext TEXT,refresh_token_iv TEXT,token_type TEXT,scope TEXT,token_expires_at INTEGER,session_expires_at INTEGER,created_at INTEGER,last_seen_at INTEGER)',
  );
  await env.AUTH_DB.exec(
    'CREATE TABLE IF NOT EXISTS worlds (guild_id TEXT PRIMARY KEY,map_slug TEXT,visibility TEXT,created_at INTEGER,updated_at INTEGER,last_synced_at INTEGER)',
  );
  await env.AUTH_DB.exec('DELETE FROM sessions');
  await createSession(actor);
  await createD1WorldRepository(env.AUTH_DB).recordSync(actor.guildId, 'test-map', 0);
  vi.mocked(sendLiveCommand).mockImplementation(async (_env, command) => {
    if (command.type === 'world-read')
      return {
        type: 'world-result',
        requestId: crypto.randomUUID(),
        result: baseline(command.userId),
      };
    return { type: 'release-result', requestId: crypto.randomUUID() };
  });
});

it('binds sessions to the member and Unix-second expiry', () => {
  const current = { userId: actor.userId, sessionExpiresAt: 100 };
  expect(sessionBindingIsCurrent(current, actor, 99_000)).toBe(true);
  expect(sessionBindingIsCurrent(current, actor, 100_000)).toBe(false);
  expect(sessionBindingIsCurrent(current, { ...actor, userId: '100000000000000003' }, 99_000)).toBe(
    false,
  );
  expect(sessionBindingIsCurrent(null, actor, 99_000)).toBe(false);
});

it('coalesces one member baseline and keeps different role projections separate', async () => {
  const other = { ...actor, userId: '300000000000000004', sessionHash: 'other-invented-session' };
  await createSession(other);
  const coordinator = new LiveWorldCoordinator(env, 7, async () => undefined);
  const id = coordinator.subscriptionId(actor.userId);
  const [first, duplicate, second] = await Promise.all([
    coordinator.read(actor, id),
    coordinator.read(actor, id),
    coordinator.read(other, coordinator.subscriptionId(other.userId)),
  ]);
  expect(first).toBe(duplicate);
  expect(first.snapshot.areas).not.toEqual(second.snapshot.areas);
  expect(
    vi
      .mocked(sendLiveCommand)
      .mock.calls.filter(
        ([, command]) => command.type === 'world-read' && command.userId === actor.userId,
      ),
  ).toHaveLength(1);
});

it('fences a removal arriving during a delayed private projection', async () => {
  const delivered: WorldView[] = [];
  const coordinator = new LiveWorldCoordinator(env, 1, async (_id, view) => {
    if (view) delivered.push(view);
  });
  await coordinator.read(actor, coordinator.subscriptionId(actor.userId), 'connected');
  await coordinator.pendingWork();
  delivered.length = 0;
  let resume!: () => void;
  let started!: () => void;
  const startedPromise = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const original = projection.projectChannelState;
  vi.spyOn(projection, 'projectChannelState').mockImplementation(async (input) => {
    started();
    await gate;
    return original(input);
  });
  source.guild.name = 'Changed guild';
  await coordinator.accept(frame({ type: 'world-source', source }, 2), 0);
  await startedPromise;
  await coordinator.accept(
    frame({ type: 'world-member', member: { kind: 'absent', userId: actor.userId } }, 3),
    0,
  );
  resume();
  await coordinator.pendingWork();
  expect(delivered).toHaveLength(0);
  expect(coordinator.currentView(actor)).toBeNull();
});

it('preserves view identity for duplicate source and applied private result', async () => {
  const coordinator = new LiveWorldCoordinator(env, 1, async () => undefined);
  const id = coordinator.subscriptionId(actor.userId);
  const first = await coordinator.read(actor, id);
  await coordinator.accept(frame({ type: 'world-source', source }, 2), 0);
  const requestId = crypto.randomUUID();
  vi.mocked(sendLiveCommand).mockResolvedValueOnce({
    type: 'channel-result',
    requestId,
    result: { status: 'applied', requestId, view: null },
    read: baseline(actor.userId, 2),
  });
  const result = await coordinator.mutate(actor, {
    kind: 'create',
    data: { name: 'invented', type: 'text', parentKey: null },
  });
  expect(result.status).toBe('applied');
  if (result.status === 'applied') expect(result.view).toBe(first);
});

it('requires a fresh baseline for a restored connected watch and rejects later deleted sessions', async () => {
  const delivered: WorldView[] = [];
  const coordinator = new LiveWorldCoordinator(env, 8, async (_id, view) => {
    if (view) delivered.push(view);
  });
  const restoredId = crypto.randomUUID();
  let resume!: (value: Awaited<ReturnType<typeof sendLiveCommand>>) => void;
  let started!: () => void;
  const startedPromise = new Promise<void>((resolve) => {
    started = resolve;
  });
  vi.mocked(sendLiveCommand).mockImplementationOnce(async () => {
    started();
    return new Promise((resolve) => {
      resume = resolve;
    });
  });
  const reading = coordinator.read(actor, restoredId, 'connected');
  await startedPromise;
  expect(delivered).toHaveLength(0);
  expect(coordinator.currentView(actor)).toBeNull();
  expect(vi.mocked(sendLiveCommand).mock.calls[0]?.[1]).toMatchObject({
    subscriptionId: restoredId,
    watch: 'connected',
  });
  resume({ type: 'world-result', requestId: crypto.randomUUID(), result: baseline() });
  await reading;
  await coordinator.pendingWork();
  delivered.length = 0;
  await createD1AuthRepository(env.AUTH_DB).deleteSession(actor.sessionHash);
  source.guild.name = 'After logout';
  await coordinator.accept(frame({ type: 'world-source', source }, 2), 0);
  await coordinator.pendingWork();
  expect(delivered).toHaveLength(0);
});
