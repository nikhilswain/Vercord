import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('Dmap Worker routing', () => {
  it('returns a non-cacheable health response', async () => {
    const response = await SELF.fetch('https://dmap.test/api/health');

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({
      service: 'dmap',
      status: 'ok',
    });
  });

  it('returns a stable JSON error for an unknown API route', async () => {
    const response = await SELF.fetch('https://dmap.test/api/unknown');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'API route not found.',
      },
    });
  });
});
