import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
    // Global ignores — generated output and dependencies.
    {
        ignores: [
            '**/node_modules/**',
            '**/dist/**',
            '**/lib/**',
            '**/build/**',
            '**/.svelte-kit/**',
            '**/android/**',
            '**/ios/**',
            '**/capacitor/**',
            '**/*.cjs',
            '**/*.config.{js,mjs,ts}',
            '**/scripts/**',
            '**/public/sw.js',
            'temp/**',
        ],
    },

    // Base: JS recommended + TS recommended for all TypeScript files.
    js.configs.recommended,
    ...tseslint.configs.recommended,

    // The codebase uses `any` in catch blocks and platform-specific glue.
    // Fixing every instance is a separate refactoring task; disable for now.
    {
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            // Allow _-prefixed names for intentionally unused interface params.
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
            }],
        },
    },

    // Published packages: no console output allowed — it leaks into every consumer.
    {
        files: ['packages/core/src/**/*.ts', 'packages/renderer/src/**/*.ts'],
        rules: {
            'no-console': 'error',
        },
    },

    // Transports and the virtual driver: console is platform-specific diagnostics.
    // Fixing these is a follow-up; they're imported via subpath exports, not the main barrel.
    // Transport methods implement the IDeviceTransport interface and often leave params unused.
    {
        files: [
            'packages/core/src/core/transports/**',
            'packages/core/src/drivers/dummy/**',
        ],
        rules: {
            'no-console': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            'prefer-const': 'off',
        },
    },

    // Apps and test files: console output is intentional; unused args are common in stubs.
    {
        files: ['apps/**/*.ts', '**/*.spec.ts', '**/*.test.ts'],
        rules: {
            'no-console': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/prefer-as-const': 'off',
        },
    },

    // Disable style rules that conflict with Prettier (must be last).
    prettier,
);

