import { defineConfig, mergeConfig } from 'vitest/config';
import path from 'path';
import baseConfig from '../../../vitest.base';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ['tests/**/*.test.ts'],
    },
    resolve: {
      alias: {
        src: path.resolve(__dirname, '../../core/src'),
      },
    },
  }),
);
