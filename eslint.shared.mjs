/**
 * Shared ESLint flat-config factory for all @invect/* packages.
 *
 * Usage (in any package's eslint.config.mjs):
 *
 *   import { createEslintConfig } from '../../eslint.shared.mjs';
 *   export default createEslintConfig(import.meta.dirname, { env: 'node' });
 */

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/**
 * @param {string}  rootDir      – pass `import.meta.dirname` from the calling package
 * @param {object}  [options]
 * @param {'node'|'browser'} [options.env='node']        – which global set to expose
 * @param {boolean} [options.jsx=false]                   – enable JSX parsing
 * @param {string[]} [options.sourceFiles]                – override source globs
 * @param {string[]} [options.projectFiles=['./tsconfig.json']] – tsconfig files used for type-aware linting
 * @param {object}  [options.extraRules={}]               – rules merged on top of defaults
 * @param {boolean} [options.testFiles=false]             – add a relaxed test-file config
 */
export function createEslintConfig(rootDir, options = {}) {
  const {
    env = 'node',
    jsx = false,
    sourceFiles = jsx ? ['src/**/*.{ts,tsx}'] : ['src/**/*.ts'],
    projectFiles = ['./tsconfig.json'],
    extraRules = {},
    testFiles = false,
  } = options;

  const envGlobals =
    env === 'browser'
      ? { ...globals.browser, ...globals.es2022 }
      : { ...globals.node, ...globals.es2022 };

  // ── Build the flat-config array ──────────────────────────────────────────
  const configs = [
    // Global ignores
    {
      ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/drizzle/**'],
    },

    // Base recommended rule-sets
    eslint.configs.recommended,
    ...tseslint.configs.recommended,

    // JS / config files at the package root
    {
      files: ['*.{js,mjs,cjs}'],
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        globals: { ...globals.node },
      },
      rules: {
        ...eslint.configs.recommended.rules,
      },
    },

    // TypeScript source files
    {
      files: sourceFiles,
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        globals: envGlobals,
        parserOptions: {
          project: projectFiles,
          tsconfigRootDir: rootDir,
          ...(jsx ? { ecmaFeatures: { jsx: true } } : {}),
        },
      },
      rules: {
        // ── TypeScript ────────────────────────────────────────────────────
        '@typescript-eslint/no-unused-vars': [
          'warn',
          {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            ignoreRestSiblings: true,
            destructuredArrayIgnorePattern: '^_',
          },
        ],
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-non-null-assertion': 'warn',
        '@typescript-eslint/prefer-as-const': 'error',
        '@typescript-eslint/ban-ts-comment': [
          'error',
          {
            'ts-expect-error': 'allow-with-description',
            'ts-ignore': 'allow-with-description',
            'ts-nocheck': false,
            'ts-check': false,
          },
        ],
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-inferrable-types': 'off',
        '@typescript-eslint/no-empty-function': 'warn',

        // ── General ───────────────────────────────────────────────────────
        'no-console': 'warn',
        'no-debugger': 'error',
        'no-unused-vars': 'off', // handled by the TS version
        'prefer-const': 'error',
        'no-var': 'error',
        eqeqeq: ['error', 'always'],
        curly: ['error', 'all'],

        // ── Per-package overrides ─────────────────────────────────────────
        ...extraRules,
      },
    },
  ];

  // ── Relaxed rules for test files ─────────────────────────────────────────
  if (testFiles) {
    configs.push({
      files: ['tests/**/*.{ts,tsx}', '**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        globals: { ...globals.node, ...globals.es2022 },
        parserOptions: {
          project: projectFiles,
          tsconfigRootDir: rootDir,
        },
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/ban-ts-comment': 'off',
        '@typescript-eslint/no-unused-vars': [
          'warn',
          {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            ignoreRestSiblings: true,
            destructuredArrayIgnorePattern: '^_',
          },
        ],
        'no-console': 'off',
        'prefer-const': 'warn',
        '@typescript-eslint/no-empty-function': 'off',
      },
    });
  }

  return tseslint.config(...configs);
}
