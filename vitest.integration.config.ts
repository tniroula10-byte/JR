import { defineConfig } from 'vitest/config';
import path from 'path';

// Runs against a local Supabase stack; see tests/integration/live-db.test.ts
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.')
    }
  }
});
