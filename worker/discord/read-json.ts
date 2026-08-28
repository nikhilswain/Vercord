import { WorkerError } from '../errors';

export const DISCORD_REQUEST_TIMEOUT_MS = 10_000;
export const DISCORD_SYNC_BUDGET_MS = 45_000;
export const DISCORD_MAX_BODY_BYTES = 5 * 1024 * 1024;
export const DISCORD_MAX_RETRIES = 2;
export const DISCORD_MAX_RATE_LIMIT_MS = 10_000;

function isJsonMediaType(value: string | null): boolean {
  if (value === null) return false;
  const mediaType = value.split(';', 1)[0]!.trim().toLowerCase();
  return (
    mediaType === 'application/json' || /^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(mediaType)
  );
}

export async function readBoundedJson(
  response: Response,
  maximumBytes = DISCORD_MAX_BODY_BYTES,
): Promise<unknown> {
  const declaredLength = response.headers.get('Content-Length');
  if (declaredLength !== null) {
    const bytes = Number(declaredLength);
    if (!Number.isSafeInteger(bytes) || bytes < 0) {
      throw new WorkerError('DISCORD_RESPONSE_INVALID');
    }
    if (bytes > maximumBytes) throw new WorkerError('DISCORD_RESPONSE_TOO_LARGE');
  }
  if (!isJsonMediaType(response.headers.get('Content-Type'))) {
    throw new WorkerError('DISCORD_RESPONSE_INVALID');
  }
  if (response.body === null) throw new WorkerError('DISCORD_RESPONSE_INVALID');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (totalBytes + value.byteLength > maximumBytes) {
        try {
          await reader.cancel();
        } catch {
          // Cancellation is best effort; the stable size error remains authoritative.
        }
        throw new WorkerError('DISCORD_RESPONSE_TOO_LARGE');
      }
      chunks.push(value);
      totalBytes += value.byteLength;
    }
  } catch (error) {
    if (error instanceof WorkerError) throw error;
    throw new WorkerError('DISCORD_RESPONSE_INVALID');
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) throw new WorkerError('DISCORD_RESPONSE_INVALID');
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
    if (text.trim().length === 0) throw new Error();
    return JSON.parse(text) as unknown;
  } catch {
    throw new WorkerError('DISCORD_RESPONSE_INVALID');
  }
}
