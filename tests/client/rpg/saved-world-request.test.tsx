import { StrictMode, type PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateWorldDocument } from '../../../src/domain/world/generate';
import { savedWorldResponseSchema } from '../../../src/domain/world/protocol';
import { useSavedRpgWorld } from '../../../src/features/rpg/use-saved-rpg-world';
import type { RpgWorldId } from '../../../src/features/rpg/themes';

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

afterEach(() => vi.unstubAllGlobals());

describe('saved town requests', () => {
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
