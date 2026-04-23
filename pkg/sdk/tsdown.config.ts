import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/transform/index.ts', 'src/evaluator/index.ts'],
  format: ['esm', 'cjs'],
  dts: { resolve: false },
  sourcemap: true,
  clean: true,
  deps: {
    neverBundle: ['@invect/action-kit', '@invect/actions', 'zod', 'typescript', 'jiti'],
  },
  outExtensions({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.mjs' };
  },
});
