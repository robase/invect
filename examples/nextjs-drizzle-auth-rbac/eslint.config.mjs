import { createEslintConfig } from '../../eslint.shared.mjs';

export default createEslintConfig(import.meta.dirname, {
  env: 'browser',
  jsx: true,
  sourceFiles: ['app/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}', 'db/**/*.ts'],
});