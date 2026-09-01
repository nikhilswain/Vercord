import { parseSyncAuthConfig } from '../../worker/config/schema';

const localOrigin = 'http://localhost:5173';
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function main(): Promise<void> {
  process.loadEnvFile('.dev.vars');
  const { syncSecret } = parseSyncAuthConfig(process.env);
  const slug = process.env.MAP_SLUG;
  if (!slug || slug.length < 3 || slug.length > 63 || !slugPattern.test(slug)) {
    throw new Error('CONFIG_INVALID');
  }

  const response = await fetch(`${localOrigin}/api/admin/sync`, {
    method: 'POST',
    headers: { authorization: `Bearer ${syncSecret}` },
    signal: AbortSignal.timeout(90_000),
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`SYNC_HTTP_${response.status}${body ? ` ${body}` : ''}`);
  }

  process.stdout.write(`${body}\n`);
  process.stdout.write(`Local preview: ${localOrigin}/preview/${slug}\n`);
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : 'SYNC_FAILED';
  process.stderr.write(`Local Discord sync failed: ${message}\n`);
  process.exitCode = 1;
}
