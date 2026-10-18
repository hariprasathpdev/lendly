import js from '@eslint/js';
import globals from 'globals';
import reactX from 'eslint-plugin-react-x';
export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**'] },
  { files: ['**/*.js', '**/*.jsx'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } }, rules: { ...js.configs.recommended.rules, 'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] } },
  { ...reactX.configs.recommended, files: ['client/src/**/*.{js,jsx}'], languageOptions: { globals: globals.browser } },
  { files: ['client/src/**/*.jsx'], rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^[A-Z][A-Za-z0-9]*$' }] } },
  { files: ['client/**/*.js', 'client/**/*.jsx'], languageOptions: { globals: globals.browser } },
  { files: ['server/**/*.js', 'eslint.config.js'], languageOptions: { globals: globals.node } },
];
