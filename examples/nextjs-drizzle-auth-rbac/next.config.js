/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  transpilePackages: [
    '@invect/core',
    '@invect/frontend',
    '@invect/nextjs',
    '@invect/user-auth',
    '@invect/rbac',
  ],
  serverExternalPackages: [
    'pg',
    'better-auth',
    'drizzle-orm',
  ],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push({
        fsevents: 'commonjs fsevents',
        chokidar: 'commonjs chokidar',
      });
    }
    return config;
  },
};

export default nextConfig;
