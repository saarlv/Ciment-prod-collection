import js from '@eslint/js';
import globals from 'globals';
import reactRefresh from 'eslint-plugin-react-refresh';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import path from 'path';
import importPlugin from 'eslint-plugin-import';

export default tseslint.config(
  { ignores: ['dist'] },
  // Regular JS/TS files

  {
    extends: [],
    files: ['**/*.{ts,tsx}'],
    ignores: [
      // This block type-checks through parserOptions.project, which errors on a
      // file tsconfig.json excludes. Keep this set covering that `exclude`.
      '**/components/ui/**',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      'dist',
      'node_modules',
      '**/*.config.ts',
      // The platform's route tree for the generated entry, never the app's code.
      'vite-plugin-generate-app-index.route-tree.tsx',
      // The platform's framework-build document and entries, restored at every build.
      '.blocks/**',
      '**/test/**/*.{ts,tsx}',
      '**/types/**/*.{ts,tsx}',
      '**/hooks/**/*.{ts,tsx}',
      '**/vite-env.d.ts',
      '**/product-types.ts',
      '*.d.ts',
      '*.d.tsx',
      'code-actions/**/*.{ts,tsx}',
      'chat-components/**/*.{ts,tsx}',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        require: 'readonly',
        NodeJS: true,
        // Type-position `React.FormEvent` etc. is legal without an import (@types/react
        // declares `export as namespace React`); values still need a real import.
        React: 'readonly',
      },
      parser: tseslint.parser,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-refresh': reactRefresh,
      'react-hooks': reactHooks,
      import: importPlugin,
      '@typescript-eslint': tseslint.plugin,
    },
    // settings: {
    //   'import/resolver': {
    //     typescript: {
    //       project: './tsconfig.json',
    //     },
    //   },
    // },
    rules: {
      //'react-hooks/rules-of-hooks': 'error',
      //'react-hooks/exhaustive-deps': 'warn',
      'no-undef': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.name="require"]',
          message:
            'require is not allowed. use ES modules (import/export) instead of require().',
        },
      ],
      //'import/named': 'error', // catches missing exports
      //'@typescript-eslint/no-use-before-define': ['error'],
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
      noInlineConfig: false,
    },
  },
  // Config files without type checking. vitest.setup.ts belongs here too: it is harness wiring at
  // the app root, so it sits outside tsconfig's src-only `include` and type-aware linting cannot
  // resolve a project for it.
  {
    files: ['**/*.config.ts', 'vitest.setup.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      parser: tseslint.parser,
      parserOptions: {
        project: null,
      },
    },
  },
);
