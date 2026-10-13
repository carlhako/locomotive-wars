import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

// Browser-only and Node-only globals that must not appear in the shared simulation,
// which runs unchanged in both environments.
const environmentGlobals = [
  'window',
  'document',
  'navigator',
  'location',
  'localStorage',
  'sessionStorage',
  'requestAnimationFrame',
  'HTMLElement',
  'HTMLCanvasElement',
  'process',
  'Buffer',
  'require',
  'module',
  '__dirname',
  '__filename',
];

export default defineConfig(
  globalIgnores([
    '**/dist/**',
    '**/node_modules/**',
    '**/coverage/**',
    'reference/**',
    'openspec/**',
    '.claude/**',
    '.pi/**',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['packages/shared/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...environmentGlobals.map((name) => ({
          name,
          message:
            'packages/shared must run in both the browser and Node; keep it environment-neutral.',
        })),
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^node:',
              message: 'packages/shared must not import Node built-ins.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
