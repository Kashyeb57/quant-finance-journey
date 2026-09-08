// ESLint flat config.
//
// Tuned deliberately: this repo had ~93 style-ish warnings and exactly ONE
// genuine crash-class bug (a `useEffect` placed after an early `return` in
// CalcPlot.jsx). A linter nobody can stand to run is worse than no linter, so
// the policy is:
//
//   error  → things that crash the site or are certainly wrong.
//   warn   → things worth knowing about; they do NOT fail the build.
//
// `npm run lint` exits non-zero only on errors, which is what CI gates on.

import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  {
    ignores: [
      'build/**',
      '.docusaurus/**',
      'node_modules/**',
      '.gitnexus/**',
      'static/**',
      'scratch_*.js',
    ],
  },

  js.configs.recommended,

  // Site source — browser React.
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      // ── Crash-class: never ship these ────────────────────────────────────
      // The rule that would have caught the CalcPlot.jsx bug.
      'react-hooks/rules-of-hooks': 'error',
      // Stops `no-unused-vars` from false-flagging components used in JSX.
      'react/jsx-uses-vars': 'error',
      'react/jsx-key': 'error',

      // ── Advisory ─────────────────────────────────────────────────────────
      'react-hooks/exhaustive-deps': 'warn',
      // `React` is ignored on purpose: React 19's JSX transform makes the
      // import unnecessary, but ~40 files still carry it harmlessly. Flagging
      // all of them would bury the warnings that actually mean something.
      'no-unused-vars': [
        'warn',
        { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^(React|_)' },
      ],
      // `catch (_) {}` is an intentional idiom throughout this codebase.
      'no-empty': ['warn', { allowEmptyCatch: true }],

      // ── Off: not useful here ─────────────────────────────────────────────
      // React 19's JSX transform means no `import React` is required.
      'react/react-in-jsx-scope': 'off',
      'no-console': 'off',
    },
  },

  // Cloudflare Workers — different runtime, no browser DOM, no React.
  {
    files: ['market/**/*.js', 'analytics/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.worker, caches: 'readonly', WebSocketPair: 'readonly' },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  // Build/config files run in Node.
  {
    files: ['docusaurus.config.js', 'sidebars.js', '*.config.{js,mjs}'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
];
