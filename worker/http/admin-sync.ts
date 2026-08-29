import { DiscordDomainError } from '../../src/domain/discord/errors';
import { parseSyncAuthConfig } from '../config/schema';
import { WorkerError } from '../errors';
import type { SyncSummary } from '../sync/synchronize-guild';
import { authorizeSyncRequest } from './sync-auth';
import { jsonResponse } from './json-response';

export type GuardedSync = (env: Env) => Promise<SyncSummary>;

const STATUS_BY_CODE = {
  CONFIG_INVALID: 500,
  DISCORD_SOURCE_INVALID: 502,
  SNAPSHOT_INVALID: 500,
  EXCESSIVE_BOT_PERMISSION: 422,
  DISCORD_UNAUTHORIZED: 502,
  DISCORD_FORBIDDEN: 502,
  DISCORD_NOT_FOUND: 502,
  DISCORD_RATE_LIMITED: 503,
  DISCORD_UNAVAILABLE: 503,
  DISCORD_RESPONSE_INVALID: 502,
  DISCORD_RESPONSE_TOO_LARGE: 502,
  DISCORD_REQUEST_TIMEOUT: 504,
  SYNC_TIMEOUT: 504,
  SNAPSHOT_READ_FAILED: 503,
  SNAPSHOT_WRITE_FAILED: 503,
  SUSPICIOUS_EMPTY_SNAPSHOT: 409,
  SYNC_IN_PROGRESS: 409,
} as const;

type StableErrorCode = keyof typeof STATUS_BY_CODE;

function errorResponse(code: string, status: number, headers?: HeadersInit): Response {
  return jsonResponse({ error: { code } }, { status, headers }, { noStore: true });
}

function hasRequestBody(request: Request): boolean {
  if (request.body !== null) return true;

  const contentLength = request.headers.get('content-length');
  if (contentLength !== null && /^\d+$/.test(contentLength) && Number(contentLength) > 0) {
    return true;
  }

  return request.headers.has('transfer-encoding');
}

function stableErrorCode(error: unknown): StableErrorCode | 'SYNC_FAILED' {
  if (error instanceof WorkerError || error instanceof DiscordDomainError) return error.code;
  if (error instanceof Error && error.message === 'CONFIG_INVALID') return 'CONFIG_INVALID';
  return 'SYNC_FAILED';
}

export async function handleAdminSync(
  request: Request,
  env: Env,
  runSync: GuardedSync,
): Promise<Response> {
  if (request.method !== 'POST') {
    return errorResponse('METHOD_NOT_ALLOWED', 405, { allow: 'POST' });
  }

  if (hasRequestBody(request)) {
    return errorResponse('REQUEST_BODY_NOT_ALLOWED', 400);
  }

  let syncSecret: string;
  try {
    syncSecret = parseSyncAuthConfig(env).syncSecret;
  } catch {
    return errorResponse('CONFIG_INVALID', STATUS_BY_CODE.CONFIG_INVALID);
  }

  if (!(await authorizeSyncRequest(request.headers.get('authorization'), syncSecret))) {
    return errorResponse('UNAUTHORIZED', 401, { 'www-authenticate': 'Bearer' });
  }

  try {
    const summary = await runSync(env);
    return jsonResponse(
      {
        status: summary.status,
        schemaVersion: summary.schemaVersion,
        generatedAt: summary.generatedAt,
        categoryCount: summary.categoryCount,
        channelCount: summary.channelCount,
      },
      undefined,
      { noStore: true },
    );
  } catch (error) {
    const code = stableErrorCode(error);
    const status = code === 'SYNC_FAILED' ? 500 : STATUS_BY_CODE[code];
    return errorResponse(code, status);
  }
}
