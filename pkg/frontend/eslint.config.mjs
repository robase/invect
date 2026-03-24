import { createEslintConfig } from '../../eslint.shared.mjs';

export default createEslintConfig(import.meta.dirname, {
  env: 'browser',
  jsx: true,
  extraRules: {
    'no-console': 'off',
  },
});
