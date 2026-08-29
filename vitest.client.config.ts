import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'client',
    environment: 'jsdom',
    include: [
      'tests/unit/app/**/*.test.{ts,tsx}',
      'tests/unit/domain/map/**/*.test.ts',
      'tests/unit/domain/layout/**/*.test.ts',
      'tests/client/**/*.test.{ts,tsx}',
    ],
    setupFiles: ['./tests/unit/setup.ts'],
  },
});
