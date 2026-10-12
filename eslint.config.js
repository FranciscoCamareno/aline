import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Dependencias permitidas por módulo (diseño §4). */
const forbid = (patterns, message) => ({
  'no-restricted-imports': ['error', { patterns: [{ group: patterns, message }] }],
});

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'public', 'playwright-report', 'test-results', 'docs'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['src/domain/**'],
    rules: forbid(
      [
        'react',
        'react-*',
        'dexie',
        '@excalidraw/*',
        '**/adapters/**',
        '**/features/**',
        '**/app/**',
        '**/application/**',
      ],
      'domain no depende de React, Dexie, Excalidraw, Drive ni de otras capas.',
    ),
  },
  {
    files: ['src/application/**', 'src/ports/**'],
    rules: forbid(
      [
        'react',
        'react-*',
        'dexie',
        '@excalidraw/*',
        '**/adapters/**',
        '**/features/**',
        '**/app/**',
      ],
      'application y ports solo dependen de domain, shared y de interfaces de puertos.',
    ),
  },
  {
    files: ['src/features/**', 'src/app/**'],
    // La raíz de composición es el único sitio de app/ que conecta adaptadores remotos.
    ignores: ['src/app/composition/**'],
    rules: forbid(
      ['**/adapters/drive/**', '**/adapters/filesystem/**'],
      'La interfaz no llama directamente a Drive ni a la carpeta; usa casos de uso.',
    ),
  },
  {
    files: ['*.config.{js,ts}', 'scripts/**', 'tests/**'],
    languageOptions: { globals: { ...globals.node } },
  },
);
