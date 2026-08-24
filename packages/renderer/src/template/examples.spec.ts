/**
 * Guards the shipped sample templates: every `.ult.json` in the ULT package
 * folder must pass the strict import gate, resolve, and lint without errors at
 * its designed size. Skips gracefully if the spec folder isn't present.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseTemplate } from './validate';
import { resolveTemplate } from './template';
import { validateAcrossSizes } from './lint';
import { parseExpr } from './safe-expr';

// ULT is a sibling workspace package; these fixtures are the canonical examples.
const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(here, '../../../ult/examples');
const files = existsSync(examplesDir)
    ? readdirSync(examplesDir).filter(f => f.endsWith('.ult.json'))
    : [];

describe('sample templates (spec examples)', () => {
    if (files.length === 0) {
        it.skip('no examples folder found', () => {});
        return;
    }
    for (const file of files) {
        it(`${file} imports, resolves and lints`, () => {
            const raw = readFileSync(join(examplesDir, file), 'utf8');
            const res = parseTemplate(JSON.parse(raw));
            expect(res.ok, res.ok ? '' : (res as { errors: string[] }).errors.join('; ')).toBe(true);
            if (!res.ok) return;
            const df = res.template.adaptivity.designedFor;
            const { design, issues } = resolveTemplate(res.template, {
                widthPx: Math.round((df.labelLengthMm ?? 40) * 8),
                heightPx: Math.round(df.tapeWidthMm * 8),
                tapeWidthMm: df.tapeWidthMm, labelLengthMm: df.labelLengthMm
            });
            expect(design.elements.length).toBeGreaterThan(0);
            // No overflow at the designed size.
            expect(issues.filter(i => i.severity === 'error')).toEqual([]);

            // ...and none at *any* size in the matrix. The examples double as
            // conformance fixtures, so "lints clean everywhere" is the bar —
            // including on common media the template wasn't designed for.
            const report = validateAcrossSizes(res.template);
            const bad = report.findings.filter(f => f.severity === 'error');
            expect(
                bad.map(f => `${f.atSize.label} ${f.atSize.tapeWidthMm}x${f.atSize.labelLengthMm}mm — ${f.elementId}: ${f.message}`),
                'lint errors across the size matrix'
            ).toEqual([]);
            expect(report.ok).toBe(true);
        });

        it(`${file} keeps every expression's src in step with its AST`, () => {
            // Expression Dims may carry the source they were parsed from. If a
            // hand edit changes one and not the other, the editor would show a
            // lie — so the two must still agree.
            const raw = JSON.parse(readFileSync(join(examplesDir, file), 'utf8'));
            const mismatches: string[] = [];
            walk(raw, node => {
                if (typeof node.src !== 'string' || node.e === undefined) return;
                if (JSON.stringify(parseExpr(node.src)) !== JSON.stringify(node.e)) {
                    mismatches.push(node.src);
                }
            });
            expect(mismatches).toEqual([]);
        });
    }
});

/** Visit every plain object in a JSON tree. */
function walk(v: unknown, fn: (node: Record<string, unknown>) => void): void {
    if (Array.isArray(v)) { for (const i of v) walk(i, fn); return; }
    if (v === null || typeof v !== 'object') return;
    fn(v as Record<string, unknown>);
    for (const val of Object.values(v as Record<string, unknown>)) walk(val, fn);
}
