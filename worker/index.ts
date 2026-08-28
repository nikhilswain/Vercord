import { jsonResponse } from './http/json-response';

const HEALTH_PATH = '/api/health';

export default {
  fetch(request) {
    const { pathname } = new URL(request.url);

    if (request.method === 'GET' && pathname === HEALTH_PATH) {
      return jsonResponse(
        {
          service: 'dmap',
          status: 'ok',
        },
        {
          headers: {
            'cache-control': 'no-store',
          },
        },
      );
    }

    if (pathname.startsWith('/api/')) {
      return jsonResponse(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'API route not found.',
          },
        },
        {
          status: 404,
        },
      );
    }

    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
