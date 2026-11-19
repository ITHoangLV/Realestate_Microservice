// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'infra/**/data/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // C19 (2026-11-19): id sai trong đường dẫn phải trả 400 VALIDATION_FAILED.
    // `ParseUUIDPipe` trần trả BAD_REQUEST → dùng createUuidParamPipe('<tên>').
    files: ['services/*/src/**/*.ts'],
    ignores: ['services/*/src/common/errors/uuid-param.pipe.ts'],
    // Chặn ở import để bắt cả `new ParseUUIDPipe()` lẫn `@Param('id', ParseUUIDPipe)`.
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@nestjs/common',
              importNames: ['ParseUUIDPipe'],
              message:
                "Dùng createUuidParamPipe('<tên>') (src/common/errors/uuid-param.pipe.ts) để id sai trả 400 VALIDATION_FAILED (C19).",
            },
          ],
        },
      ],
    },
  },
  {
    // Script Node chạy trực tiếp (không qua NestJS), ví dụ contracts/scripts/check-events.mjs, scripts/generate-jwt-keys.mjs
    files: ['contracts/scripts/**/*.mjs', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', structuredClone: 'readonly' },
    },
  },
  {
    // Hook Claude Code viết CommonJS, chạy bằng `node` (project-knowledge/playbooks/*/…-guard.js)
    files: ['project-knowledge/playbooks/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        process: 'readonly',
        __dirname: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
      },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
