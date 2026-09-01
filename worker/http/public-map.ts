import { createKvPublicMapRepository } from '../storage/public-map-repository';
import { jsonResponse } from './json-response';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function errorResponse(code: string, status: number, headers?: HeadersInit): Response {
  return jsonResponse({ error: { code } }, { status, headers }, { noStore: true });
}

export async function handlePublicMap(
  request: Request,
  env: Env,
  slug: string,
): Promise<Response> {
  if (request.method !== 'GET') {
    return errorResponse('METHOD_NOT_ALLOWED', 405, { allow: 'GET' });
  }
  if (slug.length < 3 || slug.length > 63 || !slugPattern.test(slug)) {
    return errorResponse('NOT_FOUND', 404);
  }
  if (typeof env.MAP_SNAPSHOTS?.get !== 'function') {
    return errorResponse('CONFIG_INVALID', 500);
  }

  try {
    const result = await createKvPublicMapRepository(env.MAP_SNAPSHOTS).read(slug);
    if (result.state === 'missing') return errorResponse('MAP_NOT_FOUND', 404);
    if (result.state === 'invalid') return errorResponse('MAP_INVALID', 500);

    return jsonResponse(result.snapshot, {
      headers: {
        'cache-control': 'public, max-age=60, stale-while-revalidate=300',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch {
    return errorResponse('MAP_UNAVAILABLE', 503);
  }
}
