import { createPrivatePreviewMapSnapshot } from '../publication/create-public-map';
import { createKvGuildStructureRepository } from '../storage/guild-structure-repository';
import { jsonResponse } from './json-response';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function errorResponse(code: string, status: number, headers?: HeadersInit): Response {
  return jsonResponse({ error: { code } }, { status, headers }, { noStore: true });
}

export async function handleLocalPreviewMap(
  request: Request,
  env: Env,
  slug: string,
): Promise<Response> {
  if (!loopbackHosts.has(new URL(request.url).hostname)) {
    return errorResponse('NOT_FOUND', 404);
  }
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
    const result = await createKvGuildStructureRepository(env.MAP_SNAPSHOTS).read(slug);
    if (result.state === 'missing') return errorResponse('PREVIEW_NOT_SYNCED', 404);
    if (result.state === 'invalid') return errorResponse('PREVIEW_INVALID', 500);

    return jsonResponse(createPrivatePreviewMapSnapshot(result.snapshot, slug), undefined, {
      noStore: true,
    });
  } catch {
    return errorResponse('PREVIEW_UNAVAILABLE', 503);
  }
}
