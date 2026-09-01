export type AppRoute =
  | { kind: 'home'; title: 'Dmap — Your Discord world' }
  | { kind: 'demo'; title: 'Northstar Commons — Dmap' }
  | { kind: 'map'; title: 'Discord world — Dmap'; slug: string }
  | { kind: 'not-found'; title: 'Page not found — Dmap' };

const mapPathPattern = /^\/map\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;

export function resolveAppRoute(pathname: string): AppRoute {
  const path = pathname.split(/[?#]/u, 1)[0];
  if (path === '/') return { kind: 'home', title: 'Dmap — Your Discord world' };
  if (path === '/map/demo') return { kind: 'demo', title: 'Northstar Commons — Dmap' };
  const mapMatch = path?.match(mapPathPattern);
  if (mapMatch?.[1] && mapMatch[1].length >= 3 && mapMatch[1].length <= 63) {
    return { kind: 'map', title: 'Discord world — Dmap', slug: mapMatch[1] };
  }
  return { kind: 'not-found', title: 'Page not found — Dmap' };
}
