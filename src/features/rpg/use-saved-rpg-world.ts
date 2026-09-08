import { useCallback, useEffect, useState } from 'react';
import { savedWorldResponseSchema, type SavedWorldResponse } from '../../domain/world/protocol';
import type { RpgWorldId } from './themes';

export type SavedRpgStatus =
  'loading' | 'ready' | 'signed-out' | 'forbidden' | 'missing' | 'invalid' | 'unavailable';

interface RequestState {
  key: string;
  status: SavedRpgStatus;
}

function responseStatus(status: number, payload: unknown): SavedRpgStatus {
  const code =
    typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    typeof payload.error === 'object' &&
    payload.error !== null &&
    'code' in payload.error
      ? payload.error.code
      : null;
  if (status === 401) return 'signed-out';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'missing';
  if (code === 'WORLD_SAVE_INVALID' || code === 'WORLD_VERSION_UNSUPPORTED' || status === 409)
    return 'invalid';
  return 'unavailable';
}

/** Retains the last scene only for runtime ownership; callers cover it until this request succeeds. */
export function useSavedRpgWorld(guildId: string, world: RpgWorldId, travelRevision = 0) {
  const [attempt, setAttempt] = useState(0);
  const key = `${guildId}:${world}:${travelRevision}:${attempt}`;
  const [request, setRequest] = useState<RequestState | null>(null);
  const [data, setData] = useState<SavedWorldResponse | null>(null);
  const status = request?.key === key ? request.status : 'loading';
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setRequest({ key, status: 'unavailable' });
      controller.abort();
    }, 25_000);
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      void fetch(`/api/auth/guilds/${encodeURIComponent(guildId)}/rpg/${world}`, {
        method: 'POST',
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload: unknown = await response.json().catch(() => null);
          if (controller.signal.aborted) return;
          if (!response.ok) {
            setRequest({ key, status: responseStatus(response.status, payload) });
            return;
          }
          const parsed = savedWorldResponseSchema.safeParse(payload);
          if (!parsed.success || parsed.data.document.themeId !== world) {
            setRequest({ key, status: 'invalid' });
            return;
          }
          setData(parsed.data);
          setRequest({ key, status: 'ready' });
        })
        .catch(() => {
          if (!controller.signal.aborted) setRequest({ key, status: 'unavailable' });
        })
        .finally(() => clearTimeout(timeout));
    });
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [guildId, world, key]);

  return { data, status, retry };
}
