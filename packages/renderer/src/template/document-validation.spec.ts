import { describe, expect, it } from 'vitest';
import { validateTemplateDocument } from './document-validation';
import { parseExpr } from './safe-expr';

const template = {
    version: 1,
    kind: 'label-template',
    id: 'validation-test',
    name: 'Validation test',
    params: [],
    elements: [{
        type: 'shape',
        id: 'box',
        shape: 'rect',
        stroke: 1,
        fill: false,
        place: {
            anchor: 'c',
            origin: 'c',
            w: { e: parseExpr('W - 2*mm'), src: 'W - 2*mm' },
            h: { e: parseExpr('H - 2*mm'), src: 'H - 2*mm' }
        }
    }],
    adaptivity: {
        designedFor: { tapeWidthMm: 12, labelLengthMm: 40 },
        minTapeWidthMm: 12,
        maxTapeWidthMm: 15,
        minLabelLengthMm: 30,
        maxLabelLengthMm: 50
    }
};

describe('validateTemplateDocument', () => {
    it('combines strict import, expression parity, and adaptive lint', () => {
        const result = validateTemplateDocument(template);
        expect(result.ok).toBe(true);
        expect(result.parseErrors).toEqual([]);
        expect(result.expressionErrors).toEqual([]);
        expect(result.lint?.sizesTested.length).toBeGreaterThan(1);
    });

    it('rejects readable expression source that disagrees with its AST', () => {
        const changed = structuredClone(template);
        changed.elements[0].place.w.src = 'W - 3*mm';
        const result = validateTemplateDocument(changed);
        expect(result.ok).toBe(false);
        expect(result.expressionErrors).toEqual(['$.elements[0].place.w.src does not match $.elements[0].place.w.e']);
    });
});
