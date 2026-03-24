import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'router/index': 'src/invect-router.ts',
    'middleware/index': 'src/async-handler.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: false,
  report: false,
  unbundle: true,
  deps: {
    neverBundle: [
      '@invect/core',
      'express',
      'cors',
      'zod',
    ],
  },
  outExtensions({ format }) {
    return {
      js: format === 'cjs' ? '.cjs' : '.js'
    }
  }
})
