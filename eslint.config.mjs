import js from '@eslint/js';
import globals from 'globals';
export default [
  { ignores: ['public/**', 'node_modules/**', 'data/**', 'artifacts/**', '.venv/**', 'vendor/**'] },
  js.configs.recommended,
  { files: ['**/*.{js,mjs}'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.es2024, ...globals.node } }, rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }], 'no-control-regex': 'off' } },
  { files: ['frontend/*.js', 'tests/browser.mjs'], languageOptions: { globals: globals.browser } },
];
