
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Skip ESLint and TypeScript checking during build — handled separately
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // @invect/core uses @libsql/client (pure JS/WASM) for SQLite,
  // so no native Node.js binary workarounds are needed.
  serverExternalPackages: [
    '@invect/core',
    '@invect/nextjs',
  ],
  webpack: (config, { isServer }) => {
    // Handle fsevents and other optional native modules
    if (isServer) {
      config.externals.push({
        'fsevents': 'commonjs fsevents',
        'chokidar': 'commonjs chokidar',
      });
    }

    return config;
  },
};

export default nextConfig;
