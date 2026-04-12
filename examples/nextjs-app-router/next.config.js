/** @type {import('next').NextConfig} */
const nextConfig = {
  // Skip ESLint and TypeScript checking during build — handled separately
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // Workspace-linked @invect/* packages are resolved via symlink,
  // so serverExternalPackages won't fully externalize their transitive deps.
  // List native / WASM database drivers explicitly to prevent webpack from
  // trying to bundle them (which fails on README.md context imports, native
  // addons, etc.).
  serverExternalPackages: [
    '@invect/core',
    '@invect/nextjs',
    '@libsql/client',
    'libsql',
    'better-sqlite3',
  ],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // In a pnpm workspace, serverExternalPackages doesn't fully work for
      // symlinked packages — webpack resolves the symlink target as a local
      // file and traverses into it.  Force-externalize @invect/core and its
      // native database driver deps at the webpack level.
      config.externals.push(
        ({ request }, callback) => {
          if (
            /^@libsql[\\/]/.test(request) ||
            /^libsql([\\/]|$)/.test(request) ||
            /^better-sqlite3([\\/]|$)/.test(request) ||
            request === '@invect/core' ||
            request.startsWith('@invect/core/')
          ) {
            return callback(null, `module ${request}`);
          }
          callback();
        },
        {
          fsevents: 'commonjs fsevents',
          chokidar: 'commonjs chokidar',
        },
      );
    }

    return config;
  },
};

export default nextConfig;
