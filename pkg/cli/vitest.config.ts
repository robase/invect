import { defineConfig, mergeConfig } from 'vitest/config';
import { resolve } from 'path';
import baseConfig from '../../vitest.base';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ['test/**/*.test.ts'],
    },
    resolve: {
      alias: {
        src: resolve(__dirname, './src'),
      },
    },
  }),
);
