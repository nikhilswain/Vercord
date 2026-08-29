import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          DISCORD_BOT_TOKEN: 'test.bot.token.never.real.0001',
          DISCORD_GUILD_ID: '100000000000000001',
          MAP_SLUG: 'test-map',
          SYNC_SECRET: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE',
          SNAPSHOT_ID_SECRET: 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI',
        },
      },
    }),
  ],
  test: {
    name: 'worker',
    include: [
      'tests/integration/worker/**/*.test.ts',
      'tests/unit/domain/discord/**/*.test.ts',
      'tests/fixtures/discord/**/*.test.ts',
    ],
  },
});
