import { useCallback, useEffect, useState } from 'react';
import { savedWorldResponseSchema, type SavedWorldResponse } from '../../domain/world/protocol';
import type { RpgWorldId } from './themes';
import type { HouseSceneId } from '../../domain/world/catalog/scenes';
import type { ForestAreaId } from '../../domain/world/forest/catalog';

export type SavedRpgStatus =
  'loading' | 'ready' | 'signed-out' | 'forbidden' | 'missing' | 'invalid' | 'unavailable';

interface RequestState {
  key: string;
  status: SavedRpgStatus;
}

function responseCode(payload: unknown): unknown {
  return typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    typeof payload.error === 'object' &&
    payload.error !== null &&
    'code' in payload.error
    ? payload.error.code
    : null;
}

function responseStatus(status: number, payload: unknown): SavedRpgStatus {
  const code = responseCode(payload);
  if (status === 401) return 'signed-out';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'missing';
  if (code === 'WORLD_SAVE_INVALID' || code === 'WORLD_VERSION_UNSUPPORTED' || status === 409)
    return 'invalid';
  return 'unavailable';
}

/** Retains the last scene only for runtime ownership; callers cover it until this request succeeds. */
export function useSavedRpgWorld(
  guildId: string,
  world: RpgWorldId,
  travelRevision = 0,
  street?: string,
  house?: HouseSceneId,
  forest?: ForestAreaId,
) {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([guildId, world, street, house, forest, travelRevision, attempt]);
  const [request, setRequest] = useState<RequestState | null>(null);
  const [data, setData] = useState<SavedWorldResponse | null>(null);
  const status = request?.key === key ? request.status : 'loading';
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let sourceRetries = 0;
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;
    const timeout = setTimeout(() => {
      setRequest({ key, status: 'unavailable' });
      clearTimeout(retryTimeout);
      controller.abort();
    }, 25_000);
    const requestWorld = () => {
      if (controller.signal.aborted) return;
      let retryScheduled = false;
      const params = new URLSearchParams();
      if (street !== undefined) params.set('street', street);
      if (house !== undefined) params.set('house', house);
      if (forest !== undefined) params.set('forest', forest);
      const query = params.size ? `?${params}` : '';
      void fetch(`/api/auth/guilds/${encodeURIComponent(guildId)}/rpg/${world}${query}`, {
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
            if (
              response.status === 503 &&
              responseCode(payload) === 'WORLD_SOURCE_UNAVAILABLE' &&
              sourceRetries < 2
            ) {
              // The idempotent town POST may briefly wait for its source to recover.
              // Keep one deadline and the loading gate throughout both bounded retries.
              retryScheduled = true;
              retryTimeout = setTimeout(requestWorld, 400 * 2 ** sourceRetries);
              sourceRetries += 1;
              return;
            }
            setRequest({ key, status: responseStatus(response.status, payload) });
            return;
          }
          const parsed = savedWorldResponseSchema.safeParse(payload);
          if (
            !parsed.success ||
            parsed.data.document.themeId !== world ||
            (forest === undefined
              ? parsed.data.forest !== undefined
              : parsed.data.forest?.region !== forest ||
                parsed.data.forest.worldId !== parsed.data.document.worldId ||
                parsed.data.forest.seed !== parsed.data.document.seed) ||
            (house === undefined
              ? parsed.data.interior !== undefined
              : parsed.data.interior?.landmarkId !== house ||
                parsed.data.interior.worldId !== parsed.data.document.worldId ||
                parsed.data.interior.themeId !== world ||
                !parsed.data.bindings.some(
                  (binding) => binding.landmarkId === house && binding.rooms.length === 1,
                )) ||
            (street !== undefined &&
              !parsed.data.town?.continuous &&
              (!parsed.data.town ||
                parsed.data.town.activeStreetId !== (street === 'square' ? null : street)))
          ) {
            setRequest({ key, status: 'invalid' });
            return;
          }
          setData(parsed.data);
          setRequest({ key, status: 'ready' });
        })
        .catch(() => {
          if (!controller.signal.aborted) setRequest({ key, status: 'unavailable' });
        })
        .finally(() => {
          if (!retryScheduled) clearTimeout(timeout);
        });
    };
    queueMicrotask(requestWorld);
    return () => {
      clearTimeout(timeout);
      clearTimeout(retryTimeout);
      controller.abort();
    };
  }, [guildId, world, street, house, forest, key]);

  return { data, status, retry };
}
