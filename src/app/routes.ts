export type AppRoute =
  | { kind: 'home'; title: 'Dmap — Your Discord world' }
  | { kind: 'dashboard'; title: 'Your Discord worlds — Dmap' }
  | { kind: 'demo'; title: 'Northstar Commons — Dmap' }
  | { kind: 'map'; title: 'Discord world — Dmap'; slug: string }
  | { kind: 'preview'; title: 'Local Discord preview — Dmap'; slug: string }
  | { kind: 'world'; title: 'Private Discord world — Dmap'; guildId: string }
  | { kind: 'not-found'; title: 'Page not found — Dmap' };

const mapPathPattern = /^\/map\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const previewPathPattern = /^\/preview\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const worldPathPattern = /^\/world\/([1-9]\d{0,19})$/;

function validSlugFromMatch(match: RegExpMatchArray | null | undefined): string | null {
  const slug = match?.[1];
  return slug && slug.length >= 3 && slug.length <= 63 ? slug : null;
}

export function resolveAppRoute(pathname: string): AppRoute {
  const path = pathname.split(/[?#]/u, 1)[0];
  if (path === '/') return { kind: 'home', title: 'Dmap — Your Discord world' };
  if (path === '/dashboard') {
    return { kind: 'dashboard', title: 'Your Discord worlds — Dmap' };
  }
  if (path === '/map/demo') return { kind: 'demo', title: 'Northstar Commons — Dmap' };
  const worldMatch = path?.match(worldPathPattern);
  if (worldMatch?.[1]) {
    return {
      kind: 'world',
      title: 'Private Discord world — Dmap',
      guildId: worldMatch[1],
    };
  }
  const previewSlug = validSlugFromMatch(path?.match(previewPathPattern));
  if (previewSlug)
    return { kind: 'preview', title: 'Local Discord preview — Dmap', slug: previewSlug };
  const mapSlug = validSlugFromMatch(path?.match(mapPathPattern));
  if (mapSlug) return { kind: 'map', title: 'Discord world — Dmap', slug: mapSlug };
  return { kind: 'not-found', title: 'Page not found — Dmap' };
}
