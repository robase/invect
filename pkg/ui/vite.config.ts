import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';

const external = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  'use-sync-external-store',
  'use-sync-external-store/shim',
  'use-sync-external-store/shim/with-selector',
  '@radix-ui/react-dropdown-menu',
  '@radix-ui/react-select',
  '@radix-ui/react-separator',
  '@radix-ui/react-slot',
  '@radix-ui/react-tooltip',
  '@radix-ui/react-dialog',
  '@xyflow/react',
  '@tanstack/react-query',
  'clsx',
  'class-variance-authority',
  'tailwind-merge',
  'lucide-react',
  'react-router',
  'react-router-dom',
  '@invect/core',
  '@invect/core/types',
  'prettier',
  'prettier/standalone',
  'prettier/plugins/babel',
  'prettier/plugins/estree',
  'node:module',
  'perf_hooks',
  'crypto',
  'stream',
  'path',
  'util',
  'fs',
  'os',
  'better-sqlite3',
  'mysql2',
  'postgres',
  'pg',
];

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    dts({
      tsconfigPath: resolve(__dirname, 'tsconfig.json'),
      entryRoot: 'src',
      outDir: 'dist',
      insertTypesEntry: true,
      copyDtsFiles: true,
      exclude: ['src/**/*.test.*', 'src/**/*.spec.*'],
    }),
  ],
  resolve: {
    tsconfigPaths: true,
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    conditions: ['browser', 'import', 'module', 'default'],
  },
  build: {
    copyPublicDir: false,
    sourcemap: mode !== 'development',
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
      cssFileName: 'index',
    },
    rolldownOptions: {
      external,
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') {
          return;
        }

        if (
          warning.code === 'CIRCULAR_DEPENDENCY' &&
          (warning.message.includes('d3') || warning.message.includes('zod'))
        ) {
          return;
        }

        if (warning.code === 'EMPTY_IMPORT_META') {
          return;
        }

        warn(warning);
      },
      output: {
        banner: '"use client";',
      },
    },
  },
}));