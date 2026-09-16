import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DashboardPage } from '../../src/features/auth/DashboardPage';
import { GuildPicker } from '../../src/features/auth/GuildPicker';
import type { AuthSession } from '../../src/features/auth/session';
import { createDashboardCache } from '../../worker/auth/dashboard-cache';

function fixture(count = 60): AuthSession {
  return {
    user: { id: '900', displayName: 'Traveler', username: 'traveler', avatarUrl: null },
    guilds: Array.from({ length: count }, (_, index) => ({
      id: String(1_000 + index),
      name: `Forest ${index + 1}`,
      iconUrl: null,
      owner: index === 0,
      canManage: index < 3,
      connected: index < 5,
      synced: index < 5,
      published: false,
      worldUrl: index < 5 ? `/world/${1_000 + index}` : null,
    })),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('Explore server directory', () => {
  it('limits initial cards, loads more, and searches servers beyond the rendered batch', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(
      <GuildPicker
        session={fixture(200)}
        syncStates={{}}
        onSync={vi.fn()}
        onRefresh={vi.fn()}
        refreshing={false}
        refreshError={null}
      />,
    );
    const list = screen.getByRole('list', { name: 'Discord servers' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(18);
    fireEvent.click(screen.getByRole('button', { name: 'Show more servers' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(36);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search servers' }), {
      target: { value: 'Forest 200' },
    });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Forest 200' })).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get('q')).toBe('Forest 200');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    expect(within(list).getAllByRole('listitem')).toHaveLength(18);
    fireEvent.click(screen.getByRole('button', { name: /Ready to explore/ }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    expect(new URLSearchParams(window.location.search).get('filter')).toBe('ready');
    expect(screen.queryByText('Open world')).not.toBeInTheDocument();
  });

  it('loads the next batch near the end and disconnects the observer', () => {
    let callback: IntersectionObserverCallback = () => undefined;
    const disconnect = vi.fn();
    class Observer {
      constructor(next: IntersectionObserverCallback) {
        callback = next;
      }
      observe = vi.fn();
      disconnect = disconnect;
    }
    vi.stubGlobal('IntersectionObserver', Observer);
    const view = render(
      <GuildPicker
        session={fixture()}
        syncStates={{}}
        onSync={vi.fn()}
        onRefresh={vi.fn()}
        refreshing={false}
        refreshError={null}
      />,
    );
    act(() =>
      callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver),
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(36);
    view.unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it('keeps results on refresh failure and clears them when the session expires', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(fixture(2))))
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 401 }));
    vi.stubGlobal('fetch', request);
    render(<DashboardPage />);
    await screen.findByRole('heading', { name: 'Forest 1' });
    fireEvent.click(screen.getByRole('button', { name: /Refresh servers/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('previous list is still here');
    expect(screen.getByRole('heading', { name: 'Forest 1' })).toBeInTheDocument();
    expect(request.mock.calls[1]?.[0]).toBe('/api/auth/session?refresh=1');
    fireEvent.click(screen.getByRole('button', { name: /Refresh servers/ }));
    await screen.findByRole('link', { name: 'Continue with Discord' });
    expect(screen.queryByRole('heading', { name: 'Forest 1' })).not.toBeInTheDocument();
  });

  it('prevents a refresh from racing with a world sync', async () => {
    let finishRefresh: (response: Response) => void = () => undefined;
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(fixture(1))))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finishRefresh = resolve;
          }),
      );
    vi.stubGlobal('fetch', request);
    render(<DashboardPage />);
    await screen.findByRole('heading', { name: 'Forest 1' });
    fireEvent.click(screen.getByRole('button', { name: /Refresh servers/ }));
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    expect(request).toHaveBeenCalledTimes(2);
    await act(async () => finishRefresh(new Response(JSON.stringify(fixture(1)))));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sync now' })).toBeEnabled());
  });
});

describe('authenticated dashboard cache', () => {
  it('isolates sessions and origins, expires entries, and bounds retained lists', () => {
    const cache = createDashboardCache();
    cache.write('account-a:https://dmap.test', fixture(1), cache.generation, 0);
    expect(cache.read('account-b:https://dmap.test', 1)).toBeNull();
    expect(cache.read('account-a:http://localhost', 1)).toBeNull();
    expect(cache.read('account-a:https://dmap.test', 119_999)).not.toBeNull();
    expect(cache.read('account-a:https://dmap.test', 120_000)).toBeNull();
    for (let index = 0; index < 130; index += 1)
      cache.write(`${index}:origin`, fixture(1), cache.generation, 0);
    expect(cache.read('0:origin', 1)).toBeNull();
    expect(cache.read('129:origin', 1)).not.toBeNull();
  });

  it('invalidates other viewers after sync, prevents late writes, and removes logged-out sessions', () => {
    const cache = createDashboardCache();
    cache.write('a:one', fixture(1), cache.generation);
    cache.write('a:two', fixture(1), cache.generation);
    cache.write('b:one', fixture(1), cache.generation);
    const generation = cache.generation;
    cache.invalidateGuild('1000');
    cache.write('late:one', fixture(1), generation);
    expect(cache.read('a:one')).toBeNull();
    expect(cache.read('b:one')).toBeNull();
    expect(cache.read('late:one')).toBeNull();
    cache.write('a:one', fixture(1), cache.generation);
    cache.write('a:two', fixture(1), cache.generation);
    cache.write('b:one', fixture(1), cache.generation);
    cache.invalidateSession('a');
    expect(cache.read('a:one')).toBeNull();
    expect(cache.read('a:two')).toBeNull();
    expect(cache.read('b:one')).not.toBeNull();
  });
});
