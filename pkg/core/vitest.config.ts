import { defineConfig, mergeConfig } from 'vitest/config';
import { resolve } from 'path';
import baseConfig from '../../vitest.base';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      coverage: {
        thresholds: {
          global: {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80,
          },
        },
      },
      setupFiles: ['./tests/setup.ts'],
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
        src: resolve(__dirname, './src'),
      },
    },
  }),
);
