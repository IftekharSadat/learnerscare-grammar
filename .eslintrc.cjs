module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:react-hooks/recommended'],
  env: { browser: true, es2021: true, node: true },
  ignorePatterns: ['dist', 'node_modules', 'content', 'docs'],
  rules: { '@typescript-eslint/no-explicit-any': 'warn', 'no-empty': ['error', { allowEmptyCatch: true }] },
};
