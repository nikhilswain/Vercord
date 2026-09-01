const SESSION_COOKIE = 'dmap_session';
const SECURE_SESSION_COOKIE = '__Host-dmap_session';
const OAUTH_COOKIE = 'dmap_oauth_state';
const SECURE_OAUTH_COOKIE = '__Host-dmap_oauth_state';

function secureRequest(request: Request): boolean {
  return new URL(request.url).protocol === 'https:';
}

function cookieName(request: Request, kind: 'session' | 'oauth'): string {
  if (kind === 'session') return secureRequest(request) ? SECURE_SESSION_COOKIE : SESSION_COOKIE;
  return secureRequest(request) ? SECURE_OAUTH_COOKIE : OAUTH_COOKIE;
}

function cookieAttributes(request: Request, maxAge: number): string {
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureRequest(request) ? '; Secure' : ''}`;
}

export function readCookie(request: Request, kind: 'session' | 'oauth'): string | null {
  const name = cookieName(request, kind);
  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader === null) return null;

  for (const pair of cookieHeader.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0 || pair.slice(0, separator).trim() !== name) continue;
    const value = pair.slice(separator + 1).trim();
    return /^[A-Za-z0-9_-]{43}$/u.test(value) ? value : null;
  }
  return null;
}

export function setCookie(
  request: Request,
  kind: 'session' | 'oauth',
  value: string,
  maxAge: number,
): string {
  return `${cookieName(request, kind)}=${value}; ${cookieAttributes(request, maxAge)}`;
}

export function clearCookie(request: Request, kind: 'session' | 'oauth'): string {
  return `${cookieName(request, kind)}=; ${cookieAttributes(request, 0)}`;
}
