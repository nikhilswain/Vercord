import { DiscordDomainError } from '../src/domain/discord/errors';
import { WorkerError } from './errors';
import { handleAdminSync } from './http/admin-sync';
import { jsonResponse } from './http/json-response';
import { handleLocalPreviewMap } from './http/local-preview-map';
import { handlePublicMap } from './http/public-map';
import { createConsoleSafeLogger, type SafeLogger } from './logging/safe-logger';
import { createSingleFlight } from './sync/single-flight';
import { createSyncRunner } from './sync/create-sync-runner';
import type { SyncSummary } from './sync/synchronize-guild';

const HEALTH_PATH = '/api/health';
const ADMIN_SYNC_PATH = '/api/admin/sync';
const LOCAL_PREVIEW_MAP_PREFIX = '/api/preview/maps/';
const PUBLIC_MAP_PREFIX = '/api/maps/';

export interface WorkerDependencies {
  runSync(env: Env): Promise<SyncSummary>;
  logger: SafeLogger;
}

export function createWorker(dependencies: Partial<WorkerDependencies> = {}): ExportedHandler<Env> {
  const defaultRunner = createSyncRunner();
  const runSync = dependencies.runSync ?? ((env: Env) => defaultRunner.run(env));
  const logger = dependencies.logger ?? createConsoleSafeLogger();
  const guardedSync = createSingleFlight((env: Env) => runSync(env));

  return {
    fetch(request, env) {
      const { pathname } = new URL(request.url);

      if (request.method === 'GET' && pathname === HEALTH_PATH) {
        return jsonResponse(
          {
            service: 'dmap',
            status: 'ok',
          },
          {
            headers: {
              'cache-control': 'no-store',
            },
          },
        );
      }

      if (pathname === ADMIN_SYNC_PATH) {
        return handleAdminSync(request, env, guardedSync);
      }

      if (pathname.startsWith(LOCAL_PREVIEW_MAP_PREFIX)) {
        return handleLocalPreviewMap(
          request,
          env,
          pathname.slice(LOCAL_PREVIEW_MAP_PREFIX.length),
        );
      }

      if (pathname.startsWith(PUBLIC_MAP_PREFIX)) {
        return handlePublicMap(request, env, pathname.slice(PUBLIC_MAP_PREFIX.length));
      }

      if (pathname.startsWith('/api/')) {
        return jsonResponse(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'API route not found.',
            },
          },
          {
            status: 404,
          },
        );
      }

      return new Response(null, { status: 404 });
    },
    scheduled(_controller, env, ctx) {
      const correlationId = crypto.randomUUID();
      const startedAt = Date.now();
      const pending = guardedSync(env).catch((error: unknown) => {
        const outcome =
          error instanceof WorkerError || error instanceof DiscordDomainError
            ? error.code
            : error instanceof Error && error.message === 'CONFIG_INVALID'
              ? 'CONFIG_INVALID'
              : 'SYNC_FAILED';
        try {
          logger.error('discord_sync_failed', {
            correlationId,
            outcome,
            durationMs: Math.max(0, Date.now() - startedAt),
          });
        } catch {
          // Logging is best-effort and must not change handled scheduled settlement.
        }
      });
      ctx.waitUntil(pending);
    },
  } satisfies ExportedHandler<Env>;
}

export default createWorker();
