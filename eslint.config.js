import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: { window: 'readonly', document: 'readonly', fetch: 'readonly', FormData: 'readonly', crypto: 'readonly', localStorage: 'readonly' } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/incompatible-library': 'off',
      'react-hooks/purity': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  { files: ['api/**/*.ts', 'server/**/*.ts', 'scripts/**/*.ts'], languageOptions: { globals: { process: 'readonly', Buffer: 'readonly', console: 'readonly', Request: 'readonly', Response: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', Headers: 'readonly', fetch: 'readonly' } } },
);
