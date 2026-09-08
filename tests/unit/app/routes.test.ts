import { describe, expect, it } from 'vitest';

import { resolveAppRoute } from '../../../src/app/routes';

describe('resolveAppRoute', () => {
  it.each([
    ['/', { kind: 'home', title: 'Dmap — Your Discord world' }],
    ['/?source=demo#top', { kind: 'home', title: 'Dmap — Your Discord world' }],
    ['/map/demo', { kind: 'demo', title: 'Northstar Commons — Dmap' }],
    ['/map/demo?room=welcome#atlas', { kind: 'demo', title: 'Northstar Commons — Dmap' }],
    ['/map/demo/', { kind: 'not-found', title: 'Page not found — Dmap' }],
    ['/play/demo', { kind: 'rpg-demo', title: 'Willowmere — Dmap' }],
    [
      '/play/123?theme=dungeon&from=norse',
      { kind: 'rpg-saved', title: 'Your server town — Dmap', guildId: '123' },
    ],
    ['/play/0', { kind: 'not-found', title: 'Page not found — Dmap' }],
    ['/play/01', { kind: 'not-found', title: 'Page not found — Dmap' }],
    ['/play/123456789012345678901', { kind: 'not-found', title: 'Page not found — Dmap' }],
    ['/play/123/', { kind: 'not-found', title: 'Page not found — Dmap' }],
    ['/worlds/foundation', { kind: 'not-found', title: 'Page not found — Dmap' }],
  ] as const)('resolves %s', (pathname, expected) => {
    expect(resolveAppRoute(pathname)).toEqual(expected);
  });
});
