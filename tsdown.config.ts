import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: {
    resolve: true,
    compilerOptions: {
      baseUrl: '.',
      paths: {
        'src/*': ['pkg/core/src/*']
      },
      skipLibCheck: true
    }
  },
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  external: [
    // Core NestJS framework - should be provided by consuming app
    '@nestjs/common',
    '@nestjs/core', 
    '@nestjs/schedule',
    // Core Node.js/NestJS dependencies that should be shared
    'reflect-metadata',
    'rxjs',
    // React dependencies - should be provided by consuming React app
    'react',
    'react-dom',
    '@tanstack/react-query',
    'react-router',
    // Node.js built-ins that cause issues in DTS bundling
    'stream',
    'node:stream',
    'fs',
    'node:fs',
    'path',
    'node:path',
    'crypto',
    'node:crypto',
    'util',
    'node:util',
    'os',
    'node:os',
    'buffer',
    'node:buffer',
    'events',
    'node:events',
    // Database packages that have complex type definitions
    'postgres',
    'better-sqlite3',
    'mysql2',
    'drizzle-orm',
    // Everything else gets bundled for self-contained packages
  ],
  target: 'esnext',
  outExtension({ format }) {
    return {
      js: format === 'cjs' ? '.cjs' : '.mjs'
    };
  },
  esbuildOptions(options) {
    // Add path resolution for src/* imports from pkg/core
    options.alias = {
      'src': './pkg/core/src'
    }
  }
});
