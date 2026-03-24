import { createEslintConfig } from '../../eslint.shared.mjs';

export default createEslintConfig(import.meta.dirname, {
  env: 'node',
  testFiles: true,
});