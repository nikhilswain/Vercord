import {
  channelMutationInputSchema,
  type ChannelMutationResult,
} from '../../src/domain/channels/protocol';
import type { WorldActor } from '../live-world/session-access';
import { mutateAuthorizedWorld } from '../live-world/service';
import { ChannelActionError } from './mutations';

export async function changeChannel(
  request: Request,
  env: Env,
  actor: WorldActor,
  roomKey: string | null,
  beforeDispatch: () => Promise<void>,
): Promise<ChannelMutationResult> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim();
  if (contentType !== 'application/json') throw new ChannelActionError('INVALID_REQUEST', 400);
  const reader = request.body?.getReader();
  if (!reader) throw new ChannelActionError('INVALID_REQUEST', 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const bodyTimer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => undefined);
  }, 5_000);
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 4_096) {
        await reader.cancel();
        throw new ChannelActionError('INVALID_REQUEST', 413);
      }
      chunks.push(chunk.value);
    }
  } finally {
    clearTimeout(bodyTimer);
    reader.releaseLock();
  }
  if (timedOut) throw new ChannelActionError('INVALID_REQUEST', 408);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    throw new ChannelActionError('INVALID_REQUEST', 400);
  }
  const parsed = channelMutationInputSchema.safeParse(
    request.method === 'POST'
      ? { kind: 'create', data: body }
      : request.method === 'PATCH'
        ? { kind: 'rename', roomKey, data: body }
        : { kind: 'delete', roomKey, data: body },
  );
  if (!parsed.success) throw new ChannelActionError('INVALID_REQUEST', 400);

  await beforeDispatch();
  return mutateAuthorizedWorld(env, actor, parsed.data);
}
