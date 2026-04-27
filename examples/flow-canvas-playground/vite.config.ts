import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { visualizer } from 'rollup-plugin-visualizer';

const pkg = (p: string) => path.resolve(__dirname, '../../pkg', p);

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: 'dist/bundle-analysis.html',
      template: 'treemap',
      gzipSize: true,
      brotliSize: true,
      open: false,
    }),
  ],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router'],
    alias: [
      // Resolve the flow-canvas subpath directly to the source so we
      // exercise the decoupled entry, not a stale pre-built bundle.
      {
        find: /^@invect\/ui\/flow-canvas$/,
        replacement: pkg('ui/src/flow-canvas/index.ts'),
      },
      {
        find: /^@invect\/ui\/styles$/,
        replacement: pkg('ui/dist/index.css'),
      },
      { find: /^@invect\/ui$/, replacement: pkg('ui/src/index.ts') },
      { find: /^@invect\/action-kit$/, replacement: pkg('action-kit/src/index.ts') },
    ],
  },
  server: {
    port: 5180,
  },
  build: {
    sourcemap: true,
  },
});
