export type AppRoute =
  | { kind: 'home'; title: 'Dmap — Your Discord world' }
  | { kind: 'demo'; title: 'Northstar Commons — Dmap' }
  | { kind: 'not-found'; title: 'Page not found — Dmap' };

export function resolveAppRoute(pathname: string): AppRoute {
  const path = pathname.split(/[?#]/u, 1)[0];
  if (path === '/') return { kind: 'home', title: 'Dmap — Your Discord world' };
  if (path === '/map/demo') return { kind: 'demo', title: 'Northstar Commons — Dmap' };
  return { kind: 'not-found', title: 'Page not found — Dmap' };
}
