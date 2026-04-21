import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';

const pkg = (p: string) => path.resolve(__dirname, '../../pkg', p);

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      // Subpath aliases must come before their package root alias.
      // Use exact regex so @invect/ui/styles etc. are not caught.
      {
        find: /^@invect\/version-control\/providers\/github$/,
        replacement: pkg('plugins/version-control/src/providers/github.browser.ts'),
      },
      {
        find: /^@invect\/version-control$/,
        replacement: pkg('plugins/version-control/src/browser.ts'),
      },
      { find: /^@invect\/user-auth$/, replacement: pkg('plugins/auth/src/browser.ts') },
      { find: /^@invect\/rbac$/, replacement: pkg('plugins/rbac/src/browser.ts') },
      { find: /^@invect\/webhooks$/, replacement: pkg('plugins/webhooks/src/browser.ts') },
      { find: /^@invect\/mcp$/, replacement: pkg('plugins/mcp/src/browser.ts') },
      {
        find: /^@invect\/vercel-workflows$/,
        replacement: pkg('plugins/vercel-workflows/src/browser.ts'),
      },
      { find: /^@invect\/layouts$/, replacement: pkg('layouts/src/index.ts') },
      { find: /^@invect\/ui$/, replacement: pkg('ui/src/index.ts') },
    ],
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@xyflow/react',
      '@tanstack/react-query',
      'use-sync-external-store',
      'use-sync-external-store/shim',
    ],
  },
  build: {
    rollupOptions: {
      external: [/^@invect\/core/],
    },
  },
  server: {
    hmr: {
      overlay: false,
    },
    watch: {
      // pnpm symlinks workspace packages into node_modules — un-ignore them so
      // Vite picks up dist rebuilds from pkg/* without a manual restart.
      ignored: (p: string) => p.includes('node_modules') && !p.includes('node_modules/@invect'),
    },
    proxy: {
      '/api/invect': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
