import { createEslintConfig } from '../../../eslint.shared.mjs';

export default createEslintConfig(import.meta.dirname, {
  env: 'node',
  projectFiles: ['./tsconfig.json', './tsconfig.eslint.json'],
  testFiles: true,
});
