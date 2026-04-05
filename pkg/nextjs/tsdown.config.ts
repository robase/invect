import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: false,
  clean: true,
  deps: {
    skipNodeModulesBundle: true,
  },
  splitting: false,
  sourcemap: true,
});
