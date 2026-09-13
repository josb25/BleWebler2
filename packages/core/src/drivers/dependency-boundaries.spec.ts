import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const DRIVERS_ROOT = __dirname;

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(path);
        return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
    });
}

describe('driver dependency boundaries', () => {
    it('gives every non-empty driver folder a public entry point', () => {
        const missingEntryPoints = readdirSync(DRIVERS_ROOT, { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map(entry => resolve(DRIVERS_ROOT, entry.name))
            .filter(directory => sourceFiles(directory).length > 0)
            .filter(directory => !existsSync(resolve(directory, 'index.ts')))
            .map(directory => relative(DRIVERS_ROOT, directory));

        expect(missingEntryPoints).toEqual([]);
    });

    it('does not import implementation code from a sibling driver family', () => {
        const families = new Set(
            readdirSync(DRIVERS_ROOT, { withFileTypes: true })
                .filter(entry => entry.isDirectory())
                .map(entry => entry.name)
        );
        const violations: string[] = [];
        const relativeImport = /(?:from\s+|import\s*\()\s*['"](\.[^'"]+)['"]/g;

        for (const file of sourceFiles(DRIVERS_ROOT)) {
            const sourceFamily = relative(DRIVERS_ROOT, file).split(sep)[0];
            if (!families.has(sourceFamily)) continue;

            const source = readFileSync(file, 'utf8');
            for (const match of source.matchAll(relativeImport)) {
                const target = resolve(dirname(file), match[1]);
                const targetRelative = relative(DRIVERS_ROOT, target);
                if (targetRelative.startsWith(`..${sep}`)) continue;
                const targetFamily = targetRelative.split(sep)[0];
                if (families.has(targetFamily) && targetFamily !== sourceFamily) {
                    violations.push(`${relative(DRIVERS_ROOT, file)} -> ${match[1]}`);
                }
            }
        }

        expect(violations).toEqual([]);
    });
});
