import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      src: resolve(__dirname, './src'),
    },
  },
});
