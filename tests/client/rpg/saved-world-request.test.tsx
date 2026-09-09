import { StrictMode, type PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateWorldDocument } from '../../../src/domain/world/generate';
import { savedWorldResponseSchema } from '../../../src/domain/world/protocol';
import { useSavedRpgWorld } from '../../../src/features/rpg/use-saved-rpg-world';
import type { RpgWorldId } from '../../../src/features/rpg/themes';
import { readRpgRoute, resolveRpgTravel, writeRpgRoute } from '../../../src/features/rpg/themes';
import { generateHouseInterior } from '../../../src/domain/world/interiors';
import type { HouseSceneId } from '../../../src/domain/world/catalog/scenes';

const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;
const payload = (themeId: RpgWorldId) => ({
  document: generateWorldDocument({
    worldId: 'c41ec8ec-0606-47ed-9dcc-87a1c5535ab1',
    themeId,
    seed: 'e66d39d2-9139-49da-8e41-000000000001',
  }),
  checksum: 'a'.repeat(64),
  createdAt: 1,
  server: { displayName: 'A server' },
  bindings: [],
  player: { displayName: 'A traveler', memberKey: `m_${'a'.repeat(43)}` },
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('saved town requests', () => {
  it('restores a house URL and clears the house on location or world travel', () => {
    const route = readRpgRoute('?theme=norse&street=square&house=house%3A7');
    expect(route).toEqual({ theme: 'norse', world: 'norse', street: 'square', house: 'house:7' });
    expect(
      readRpgRoute(writeRpgRoute(new URL('https://example.test/play/123'), route).search),
    ).toEqual(route);
    expect(resolveRpgTravel(route, 'return')).toEqual({
      theme: 'norse',
      world: 'norse',
      street: 'square',
    });
    expect(resolveRpgTravel(route, 'dungeon')).not.toHaveProperty('house');
    expect(resolveRpgTravel(route, 'village')).not.toHaveProperty('house');
    expect(readRpgRoute('?theme=dungeon&house=house:7')).not.toHaveProperty('house');
    expect(readRpgRoute('?house=house:007')).not.toHaveProperty('house');
  });

  it('owns the requested house and rejects a different or stale interior', async () => {
    const housePayload = (landmarkId: HouseSceneId) => {
      const saved = payload('village');
      return {
        ...saved,
        bindings: [{ landmarkId, rooms: [{ key: 'r_one', label: 'Garden', type: 'text' }] }],
        interior: generateHouseInterior({
          worldId: saved.document.worldId,
          seed: saved.document.seed,
          themeId: 'village',
          landmarkId,
          roomType: 'text',
        }),
      };
    };
    const requests: Array<{ resolve(response: Response): void; signal: AbortSignal }> = [];
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve) => requests.push({ resolve, signal: init.signal! })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(
      ({ house }: { house: HouseSceneId | undefined }) =>
        useSavedRpgWorld('123', 'village', 0, undefined, house),
      { initialProps: { house: 'house:0' as HouseSceneId | undefined } },
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/auth/guilds/123/rpg/village?house=house%3A0');
    await act(async () => requests[0]!.resolve(Response.json(housePayload('house:0'))));
    expect(result.current.status).toBe('ready');
    expect(result.current.data?.interior?.landmarkId).toBe('house:0');
    rerender({ house: 'house:1' });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(requests).toHaveLength(2));
    await act(async () => requests[1]!.resolve(Response.json(housePayload('house:0'))));
    expect(result.current.status).toBe('invalid');
    rerender({ house: 'house:2' });
    await waitFor(() => expect(requests).toHaveLength(3));
    rerender({ house: undefined });
    await waitFor(() => expect(requests).toHaveLength(4));
    expect(requests[2]!.signal.aborted).toBe(true);
    await act(async () => requests[2]!.resolve(Response.json(housePayload('house:2'))));
    expect(result.current.status).toBe('loading');
    await act(async () => requests[3]!.resolve(Response.json(payload('village'))));
    expect(result.current.status).toBe('ready');
    expect(result.current.data?.interior).toBeUndefined();
  });

  it('rejects interiors from a different saved world or without an authorized channel binding', async () => {
    const saved = payload('village');
    const interior = generateHouseInterior({
      worldId: '477c9d0e-2445-4a17-a66d-80b93660cc0b',
      seed: saved.document.seed,
      themeId: 'village',
      landmarkId: 'house:0',
      roomType: 'text',
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          ...saved,
          interior,
          bindings: [
            { landmarkId: 'house:0', rooms: [{ key: 'r_one', label: 'Garden', type: 'text' }] },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ ...saved, interior: { ...interior, worldId: saved.document.worldId } }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() =>
      useSavedRpgWorld('123', 'village', 0, undefined, 'house:0'),
    );
    await waitFor(() => expect(result.current.status).toBe('invalid'));
    expect(result.current.data).toBeNull();
    act(() => result.current.retry());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.status).toBe('invalid'));
    expect(result.current.data).toBeNull();
  });

  it('keeps the map blocked through two short source-recovery retries before success', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const unavailable = () =>
      Response.json({ error: { code: 'WORLD_SOURCE_UNAVAILABLE' } }, { status: 503 });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unavailable())
      .mockResolvedValueOnce(unavailable())
      .mockResolvedValueOnce(Response.json(payload('village')));
    vi.stubGlobal('fetch', fetchMock);
    const { result, unmount } = renderHook(() => useSavedRpgWorld('123', 'village'), { wrapper });
    await act(async () => {});
    expect(result.current.status).toBe('loading');
    expect(result.current.data).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(399));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('loading');
    await act(async () => vi.advanceTimersByTimeAsync(799));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.status).toBe('ready');
    unmount();
  });

  it('stops source-recovery retries after two attempts', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          Response.json({ error: { code: 'WORLD_SOURCE_UNAVAILABLE' } }, { status: 503 }),
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { result, unmount } = renderHook(() => useSavedRpgWorld('123', 'village'));
    await act(async () => {});
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.status).toBe('unavailable');
    expect(result.current.data).toBeNull();
    unmount();
  });

  it('cancels a scheduled source retry on navigation and unmount', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          Response.json({ error: { code: 'WORLD_SOURCE_UNAVAILABLE' } }, { status: 503 }),
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender, unmount } = renderHook(
      ({ guild }) => useSavedRpgWorld(guild, 'village'),
      { initialProps: { guild: '123' } },
    );
    await act(async () => {});
    const firstSignal = fetchMock.mock.calls[0]![1].signal as AbortSignal;
    rerender({ guild: '456' });
    await act(async () => {});
    expect(firstSignal.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('loading');
    unmount();
    expect((fetchMock.mock.calls[1]![1].signal as AbortSignal).aborted).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [403, 'WORLD_SOURCE_UNAVAILABLE', 'forbidden'],
    [503, 'WORLD_SAVE_INVALID', 'invalid'],
    [503, 'WORLD_VERSION_UNSUPPORTED', 'invalid'],
    [503, 'UNAVAILABLE', 'unavailable'],
  ] as const)('does not automatically retry HTTP %s / %s', async (status, code, expected) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(Response.json({ error: { code } }, { status })));
    vi.stubGlobal('fetch', fetchMock);
    const { result, unmount } = renderHook(() => useSavedRpgWorld('123', 'village'));
    await act(async () => {});
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe(expected);
    unmount();
  });

  it('aborts superseded requests and ignores late responses across theme and server changes', async () => {
    const requests: Array<{ resolve(response: Response): void; signal: AbortSignal }> = [];
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve) => requests.push({ resolve, signal: init.signal! })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender, unmount } = renderHook(
      ({ guild, world, revision }) => useSavedRpgWorld(guild, world, revision),
      {
        wrapper,
        initialProps: { guild: '123', world: 'village' as RpgWorldId, revision: 0 },
      },
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/auth/guilds/123/rpg/village',
      expect.objectContaining({ method: 'POST', credentials: 'same-origin', cache: 'no-store' }),
    );
    rerender({ guild: '123', world: 'norse', revision: 1 });
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0]!.signal.aborted).toBe(true);
    await act(async () => requests[0]!.resolve(Response.json(payload('village'))));
    expect(result.current.status).toBe('loading');
    expect(result.current.data).toBeNull();
    const saved = payload('norse');
    expect(savedWorldResponseSchema.safeParse(saved).success).toBe(true);
    await act(async () => requests[1]!.resolve(Response.json(saved)));
    expect(result.current.status).toBe('ready');
    expect(result.current.data?.document.themeId).toBe('norse');
    rerender({ guild: '456', world: 'norse', revision: 2 });
    await waitFor(() => expect(requests).toHaveLength(3));
    expect(result.current.status).toBe('loading');
    unmount();
    expect(requests[2]!.signal.aborted).toBe(true);
  });

  it('keeps invalid responses blocked and retries the same saved-world endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ document: {} }))
      .mockResolvedValueOnce(Response.json(payload('village')));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useSavedRpgWorld('123', 'village'), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('invalid'));
    expect(result.current.data).toBeNull();
    act(() => result.current.retry());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('blocks stale or mismatched street responses while retaining the previous runtime under the gate', async () => {
    const first = '030748f2-3d55-4cf6-a1d3-fc123e05e820';
    const second = '8706967c-ff10-4224-93a7-51a753e8fe09';
    const streetPayload = (activeStreetId: string) => ({
      ...payload('village'),
      town: {
        activeStreetId,
        districts: [
          {
            key: 'd_one',
            label: 'Garden',
            streets: [first, second].map((id, index) => ({ id, number: index + 1, rooms: [] })),
          },
        ],
      },
    });
    let finish: (response: Response) => void = () => {};
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(streetPayload(first)))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(
      ({ street }) => useSavedRpgWorld('123', 'village', 0, street),
      { initialProps: { street: first } },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ street: second });
    expect(result.current.status).toBe('loading');
    expect(result.current.data?.town?.activeStreetId).toBe(first);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]![0]).toBe(`/api/auth/guilds/123/rpg/village?street=${second}`);
    await act(async () => finish(Response.json(streetPayload(first))));
    expect(result.current.status).toBe('invalid');
    expect(result.current.data?.town?.activeStreetId).toBe(first);
  });

  it.each([
    [401, 'signed-out'],
    [403, 'forbidden'],
    [404, 'missing'],
    [409, 'invalid'],
    [503, 'unavailable'],
  ] as const)('blocks HTTP %s without a replacement map', async (status, expected) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ error: { code: 'UNAVAILABLE' } }, { status })),
    );
    const { result } = renderHook(() => useSavedRpgWorld('123', 'village'));
    await waitFor(() => expect(result.current.status).toBe(expected));
    expect(result.current.data).toBeNull();
  });
});
