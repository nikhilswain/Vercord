import { z } from 'zod';

import {
  channelMutationResultSchema,
  worldViewSchema,
  type ChannelMutationInput,
  type ChannelMutationResult,
  type WorldView,
} from '../../src/domain/channels/protocol';
import { createIdentifierFactory } from '../../src/domain/discord/identifiers';
import { snowflakeSchema } from '../../src/domain/discord/source-schema';
import { decodeBase64UrlSecret } from '../config/runtime';
import { WorldAccessError } from './coordinator';
import type { WorldActor } from './session-access';
import type { WorldThemeId } from '../../src/domain/world/document';
import { savedWorldViewSchema, type StreetSelection } from '../../src/domain/world/protocol';

const worldErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/u),
    retryAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    scope: z.enum(['admission', 'mutation']).optional(),
  }),
});

async function guildPresenceStub(env: Env, guildId: string): Promise<DurableObjectStub> {
  const identifiers = await createIdentifierFactory(decodeBase64UrlSecret(env.SNAPSHOT_ID_SECRET));
  return env.WORLD_PRESENCE.getByName(await identifiers.for('guild', guildId));
}

async function fetchWorldOwner(
  env: Env,
  actor: WorldActor,
  pathname: string,
  body: unknown,
): Promise<Response> {
  const stub = await guildPresenceStub(env, actor.guildId);
  return stub.fetch(`https://presence.dmap${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function callWorldOwner(
  env: Env,
  actor: WorldActor,
  pathname: string,
  body: unknown,
): Promise<unknown> {
  const response = await fetchWorldOwner(env, actor, pathname, body);
  let value: unknown;
  try {
    value = (await response.json()) as unknown;
  } catch {
    throw new WorldAccessError();
  }
  if (!response.ok) {
    const parsed = worldErrorSchema.safeParse(value);
    if (!parsed.success) throw new WorldAccessError();
    throw new WorldAccessError(
      parsed.data.error.code,
      response.status,
      parsed.data.error.retryAt,
      parsed.data.error.scope,
    );
  }
  return value;
}

export async function readAuthorizedWorld(env: Env, actor: WorldActor): Promise<WorldView> {
  const value = await callWorldOwner(env, actor, '/internal/world-view', { actor });
  const parsed = z.strictObject({ view: worldViewSchema }).safeParse(value);
  if (!parsed.success) throw new WorldAccessError();
  return parsed.data.view;
}

export async function readAuthorizedSavedWorld(
  env: Env,
  actor: WorldActor,
  theme: WorldThemeId,
  street?: StreetSelection,
) {
  const value = await callWorldOwner(env, actor, '/internal/rpg-world', { actor, theme, street });
  const parsed = savedWorldViewSchema.safeParse(value);
  if (!parsed.success) throw new WorldAccessError('WORLD_SAVE_INVALID', 409);
  return parsed.data;
}

export async function mutateAuthorizedWorld(
  env: Env,
  actor: WorldActor,
  input: ChannelMutationInput,
): Promise<ChannelMutationResult> {
  const uncertain = (): ChannelMutationResult => ({
    status: 'uncertain',
    requestId: crypto.randomUUID(),
    code: 'CHANNEL_ACTION_UNCERTAIN',
  });
  let response: Response;
  try {
    response = await fetchWorldOwner(env, actor, '/internal/world-mutate', { actor, input });
  } catch {
    return uncertain();
  }
  let value: unknown;
  try {
    value = (await response.json()) as unknown;
  } catch {
    return uncertain();
  }
  if (response.ok) {
    const parsed = channelMutationResultSchema.safeParse(value);
    return parsed.success ? parsed.data : uncertain();
  }
  const parsed = worldErrorSchema.safeParse(value);
  if (!parsed.success || response.status >= 500) return uncertain();
  throw new WorldAccessError(
    parsed.data.error.code,
    response.status,
    parsed.data.error.retryAt,
    parsed.data.error.scope,
  );
}

export async function readAuthorizedVoiceDestination(
  env: Env,
  actor: WorldActor,
  roomKey: string,
): Promise<{ channelId: string }> {
  const value = await callWorldOwner(env, actor, '/internal/voice-destination', {
    actor,
    roomKey,
  });
  const parsed = z.strictObject({ channelId: snowflakeSchema }).safeParse(value);
  if (!parsed.success) throw new WorldAccessError();
  return parsed.data;
}
