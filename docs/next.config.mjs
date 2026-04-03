import { createMDX } from 'fumadocs-mdx/next';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  reactStrictMode: true,
  // Leave empty for a custom domain; set a repo subpath only for project Pages.
  basePath: process.env.DOCS_BASE_PATH || '',
  images: {
    unoptimized: true,
  },
  // Ensure Next.js uses this directory as root, not the monorepo root
  outputFileTracingRoot: __dirname,
};

export default withMDX(config);
