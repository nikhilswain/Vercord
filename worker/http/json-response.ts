const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';

export interface JsonResponseOptions {
  noStore?: boolean;
}

export function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
  options: JsonResponseOptions = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', JSON_CONTENT_TYPE);
  if (options.noStore) {
    headers.set('cache-control', 'no-store');
    headers.set('x-content-type-options', 'nosniff');
  }

  return Response.json(body, {
    ...init,
    headers,
  });
}
