import { createEslintConfig } from '../../eslint.shared.mjs';

export default createEslintConfig(import.meta.dirname, {
  env: 'node',
  sourceFiles: ['*.ts', 'db/**/*.ts', 'lib/**/*.ts', 'seed/**/*.ts'],
});