import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    'backend/index': 'src/backend/index.ts',
    'frontend/index': 'src/frontend/index.ts',
    'shared/types': 'src/shared/types.ts',
  },
  format: ['esm', 'cjs'],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  deps: {
    neverBundle: [
      '@invect/core',
      '@invect/frontend',
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react-router',
      '@tanstack/react-query',
      'lucide-react',
    ],
  },
  outExtensions({ format }) {
    return {
      js: format === 'cjs' ? '.cjs' : '.mjs',
    };
  },
});
