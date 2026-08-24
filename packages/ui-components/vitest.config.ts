import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    resolve: {
        alias: {
            'universal-label-renderer': path.resolve(import.meta.dirname, '../renderer/src/index.ts'),
            'universal-label-core': path.resolve(import.meta.dirname, '../core/src/index.ts')
        }
    },
    test: {
        include: ['src/**/*.spec.ts'],
        environment: 'node'
    }
});
