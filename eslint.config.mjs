import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/** @type {import('typescript-eslint').Config} */
const config = tseslint.config(
  // Ignore node_modules and dist directories
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/build/**',
      '**/.turbo/**',
      '**/drizzle/**',
      'pnpm-lock.yaml',
    ],
  },

  // Base JS/config files
  {
    files: ['*.{js,mjs,cjs}', 'scripts/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...eslint.configs.recommended.rules,
    },
  },

  // Package-specific configs - delegate to their own eslint configs
  // This prevents the root config from trying to parse TypeScript from all packages
  {
    files: ['pkg/**/*'],
    ignores: [
      'pkg/**/node_modules/**',
      'pkg/**/dist/**',
      'pkg/**/.next/**',
      'pkg/**/coverage/**',
    ],
  },

  // Examples - delegate to their own configs if they have them
  {
    files: ['examples/**/*'],
    ignores: [
      'examples/**/node_modules/**',
      'examples/**/dist/**',
      'examples/**/.next/**',
    ],
  },
);

export default config;
