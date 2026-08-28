const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', JSON_CONTENT_TYPE);

  return Response.json(body, {
    ...init,
    headers,
  });
}
