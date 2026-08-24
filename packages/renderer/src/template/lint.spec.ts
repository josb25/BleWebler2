import { describe, it, expect } from 'vitest';
import { validateAcrossSizes, sizeMatrix, resolutionFit, mediaFit } from './lint';
import { createTemplate, type LabelTemplate } from './template';
import { compileText } from './expr';

/** A P12: 203 dpi, 96-dot head. 12 mm tape × 40 mm labels = 96 × 320 px. */
const P12 = { dpmm: 8, printheadPx: 96, tapeWidthMm: 12, labelLengthMm: 40 };

function centeredText(text: string, sizePctOfH: number): LabelTemplate {
    const tpl = createTemplate('Centered', 12, 40);
    tpl.elements = [{
        type: 'text', id: 't1',
        place: { anchor: 'c', origin: 'c', size: { u: '%', v: sizePctOfH, of: 'h' }, min: { size: 6 } },
        text: compileText(text),
        font: 'bitmap', bitmapFont: 'fixed', fontFamily: 'sans-serif',
        bold: false, italic: false, underline: false, align: 'center'
    }];
    return tpl;
}

describe('multi-size lint', () => {
    it('tests the authoring size plus the built-in media profiles', () => {
        const sizes = sizeMatrix(createTemplate('x', 12, 40));
        expect(sizes.length).toBeGreaterThan(3);
        expect(sizes[0].label).toBe('Designed size');
        expect(sizes.some(s => s.tapeWidthMm === 15)).toBe(true); // from DEFAULT_PAPER_PROFILES
    });

    it('passes a small, well-anchored label at every size', () => {
        const report = validateAcrossSizes(centeredText('OK', 30));
        expect(report.ok).toBe(true);
        expect(report.findings.filter(f => f.severity === 'error')).toHaveLength(0);
    });

    it('flags a design that overflows narrow tape, tagged with the failing size', () => {
        // A long string at 60% of the tape height will overflow the narrowest media.
        const report = validateAcrossSizes(centeredText('A REALLY WIDE HEADLINE THAT WONT FIT', 60));
        expect(report.ok).toBe(false);
        const overflow = report.findings.find(f => f.code === 'overflow');
        expect(overflow).toBeDefined();
        expect(overflow!.atSize.tapeWidthMm).toBeGreaterThan(0);
        expect(overflow!.atSize.label).toBeTruthy();
    });

    it('includes declared range corners in the matrix', () => {
        const tpl = createTemplate('ranged', 12, 40);
        tpl.adaptivity.minTapeWidthMm = 6;
        tpl.adaptivity.maxTapeWidthMm = 50;
        const sizes = sizeMatrix(tpl);
        expect(sizes.some(s => s.tapeWidthMm === 6)).toBe(true);
        expect(sizes.some(s => s.tapeWidthMm === 50)).toBe(true);
    });
});

/** The same template, stamped as authored on a 203 dpi machine. */
function at203(tpl: LabelTemplate): LabelTemplate {
    tpl.adaptivity.designedFor.dpmm = 8;
    return tpl;
}

describe('resolutionFit', () => {
    it('calls a template drawn for this exact dot canvas exact', () => {
        expect(resolutionFit(at203(centeredText('OK', 30)), P12)).toBe('exact');
    });

    it('separates dots from millimetres', () => {
        // Same 12 mm tape, a 300 dpi head: 142 dots across instead of 96. The
        // millimetre question says yes and the dot question says no — which is
        // the whole reason these are two controls.
        const tpl = at203(centeredText('OK', 30));
        const hiDpi = { ...P12, dpmm: 11.81, printheadPx: 142 };
        expect(mediaFit(tpl, 12, 40)).toBe('designed');
        expect(resolutionFit(tpl, hiDpi)).not.toBe('exact');
    });

    it('never claims exact for a template that recorded no resolution', () => {
        // Silence is unknown, not a match — otherwise the dot filter would just
        // be the millimetre filter wearing a different label.
        const tpl = centeredText('OK', 30);
        expect(tpl.adaptivity.designedFor.dpmm).toBeUndefined();
        expect(resolutionFit(tpl, P12)).toBe('renders');
    });

    it('accepts an adaptive template that still resolves cleanly elsewhere', () => {
        const tpl = at203(centeredText('OK', 30));
        expect(resolutionFit(tpl, { ...P12, tapeWidthMm: 15, labelLengthMm: 30 })).toBe('renders');
    });

    it('rejects one that breaks at the target canvas', () => {
        const tpl = at203(centeredText('A REALLY WIDE HEADLINE THAT WONT FIT', 60));
        expect(resolutionFit(tpl, { ...P12, tapeWidthMm: 6, labelLengthMm: 12 })).toBe('outside');
    });

    it('clamps the canvas to the printhead', () => {
        // 15 mm of tape on a 96-dot head is still 96 dots: the extra millimetres
        // are past the edge of what the machine can mark.
        const tpl = at203(createTemplate('wide', 15, 40));
        expect(resolutionFit(tpl, { ...P12, tapeWidthMm: 15 })).toBe('exact');
    });

    it('ignores length for an auto-length template', () => {
        const tpl = at203(centeredText('OK', 30));
        tpl.adaptivity.autoLength = true;
        // Length is whatever the content needs, so it is not a claim about dots.
        expect(resolutionFit(tpl, { ...P12, labelLengthMm: 90 })).toBe('exact');
    });
});
