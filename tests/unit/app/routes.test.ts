import { describe, expect, it } from 'vitest';

import { resolveAppRoute } from '../../../src/app/routes';

describe('resolveAppRoute', () => {
  it.each([
    ['/', { kind: 'home', title: 'Dmap — Your Discord world' }],
    ['/?source=demo#top', { kind: 'home', title: 'Dmap — Your Discord world' }],
    ['/map/demo', { kind: 'demo', title: 'Demo atlas — Dmap' }],
    ['/map/demo?room=welcome#atlas', { kind: 'demo', title: 'Demo atlas — Dmap' }],
    ['/map/demo/', { kind: 'not-found', title: 'Page not found — Dmap' }],
    ['/worlds/foundation', { kind: 'not-found', title: 'Page not found — Dmap' }],
  ] as const)('resolves %s', (pathname, expected) => {
    expect(resolveAppRoute(pathname)).toEqual(expected);
  });
});
