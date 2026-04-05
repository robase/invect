import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@xyflow/react',
      '@tanstack/react-query',
      'use-sync-external-store',
      'use-sync-external-store/shim',
    ],
    // Exclude workspace packages from pre-bundling so they resolve from pnpm workspaces
    exclude: [
      '@invect/ui',
      '@invect/core',
      '@invect/user-auth',
      '@invect/rbac',
      '@invect/webhooks',
      'perf_hooks',
      'crypto',
      'stream',
      'path',
      'util',
      'fs',
      'os',
    ],
  },
  resolve: {
    // Use dedupe to ensure workspace packages are resolved from pnpm workspaces correctly
    dedupe: ['react', 'react-dom'],
  },
  build: {
    rollupOptions: {
      // Externalize @invect/core to prevent bundling Node.js runtime code
      // The types from @invect/core/types are already re-exported by @invect/ui
      external: [/^@invect\/core/],
    },
  },
  server: {
    hmr: {
      overlay: false,
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
