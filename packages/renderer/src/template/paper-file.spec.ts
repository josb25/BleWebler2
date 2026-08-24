import { describe, it, expect } from 'vitest';
import { buildPaperFile, serializePaperFile, parsePaperFile, parsePaperFileJSON, PAPER_FILE_LIMITS } from './paper-file';
import { diePath, dieSize, hasShapedDie } from '../raster/die';
import { parseTemplate } from './validate';
import { resolveTemplate, templateFromDesign } from './template';
import { createDesign } from '../model/design';
import type { AnyElement, LabelDesign } from '../model/design';
import type { PaperProfile } from 'universal-label-core';

function box(id: string): AnyElement {
    return { id, type: 'shape', shape: 'rect', x: 0, y: 0, width: 8, height: 8, stroke: 1, fill: true };
}

function design(elements: AnyElement[]): LabelDesign {
    return { ...createDesign(96, 320, 'd'), elements };
}

function paper(extra: Partial<PaperProfile> = {}): PaperProfile {
    return { id: 'p1', name: 'Test roll', type: 'gap', tapeWidthMm: 12, labelLengthMm: 40, ...extra };
}

function wrap(extra: Record<string, unknown>): unknown {
    return { version: 1, kind: 'label-paper', paper: { ...paper(), ...extra } };
}

describe('paper file', () => {
    it('round-trips a profile', () => {
        const res = parsePaperFileJSON(serializePaperFile(buildPaperFile(paper({ gapMm: 2, borderRadiusMm: 3 }))));
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.paper.name).toBe('Test roll');
        expect(res.paper.tapeWidthMm).toBe(12);
        expect(res.paper.borderRadiusMm).toBe(3);
    });

    it('gives an imported profile a fresh id', () => {
        // Two people's "12x40" are not the same profile; silently overwriting
        // one with the other would be worse than ending up with two entries.
        const res = parsePaperFile(wrap({}));
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.paper.id).not.toBe('p1');
    });

    it('rejects anything that is not a paper file', () => {
        expect(parsePaperFile(null).ok).toBe(false);
        expect(parsePaperFile({ kind: 'label-template' }).ok).toBe(false);
        expect(parsePaperFile({ kind: 'label-paper', version: 7, paper: paper() }).ok).toBe(false);
        expect(parsePaperFileJSON('{nope').ok).toBe(false);
    });

    it('rejects a profile with no usable width', () => {
        expect(parsePaperFile({ version: 1, kind: 'label-paper', paper: { name: 'x' } }).ok).toBe(false);
        expect(parsePaperFile(wrap({ tapeWidthMm: 0 })).ok).toBe(false);
        expect(parsePaperFile(wrap({ tapeWidthMm: 5000 })).ok).toBe(false);
    });

    describe('die outlines', () => {
        it('keeps a valid path outline', () => {
            const res = parsePaperFile(wrap({ die: { kind: 'path', dMm: 'M0 0 H25 V38 H16 V78 H9 V38 H0 Z' } }));
            expect(res.ok).toBe(true);
            if (res.ok) expect(res.paper.die).toEqual({ kind: 'path', dMm: 'M0 0 H25 V38 H16 V78 H9 V38 H0 Z', fillRule: 'nonzero' });
        });

        it('drops an outline that is not geometry, and says so', () => {
            // A die line is path data from a stranger. It goes through the same
            // geometry-only gate as symbol artwork, not a "looks like a path" check.
            const res = parsePaperFile(wrap({ die: { kind: 'path', dMm: 'M0 0 <script>alert(1)</script>' } }));
            expect(res.ok).toBe(true);
            if (!res.ok) return;
            expect(res.paper.die).toBeUndefined();
            expect(res.warnings.join(' ')).toMatch(/outline could not be read/i);
        });

        it('drops an absurdly long outline before parsing it', () => {
            const res = parsePaperFile(wrap({ die: { kind: 'path', dMm: 'M0 0 ' + 'L1 1 '.repeat(60000) } }));
            expect(res.ok).toBe(true);
            if (res.ok) expect(res.paper.die).toBeUndefined();
        });

        it('accepts rect radii as one number or four', () => {
            const one = parsePaperFile(wrap({ die: { kind: 'rect', radiiMm: 2 } }));
            const four = parsePaperFile(wrap({ die: { kind: 'rect', radiiMm: [1, 2, 3, 4] } }));
            expect(one.ok && one.paper.die).toEqual({ kind: 'rect', radiiMm: 2 });
            expect(four.ok && four.paper.die).toEqual({ kind: 'rect', radiiMm: [1, 2, 3, 4] });
        });

        it('ignores malformed radii rather than the whole shape', () => {
            const res = parsePaperFile(wrap({ die: { kind: 'rect', radiiMm: ['a', 2] } }));
            expect(res.ok).toBe(true);
            if (res.ok) expect(res.paper.die).toEqual({ kind: 'rect' });
        });

        it('caps and validates holes', () => {
            const res = parsePaperFile(wrap({
                holesMm: ['M2 2 h4 v4 h-4 Z', 'not a path', ...Array(20).fill('M1 1 h2 v2 h-2 Z')]
            }));
            expect(res.ok).toBe(true);
            if (!res.ok) return;
            expect(res.paper.holesMm!.length).toBeLessThanOrEqual(PAPER_FILE_LIMITS.maxHoles);
            expect(res.warnings.join(' ')).toMatch(/hole/i);
        });
    });

    describe('appearance', () => {
        it('keeps colourways and a substrate colour', () => {
            const res = parsePaperFile(wrap({
                appearance: {
                    baseColor: '#2fa84f',
                    colorways: [{ id: 'white', name: 'White', color: '#ffffff' }, { id: 'bad', name: 'Bad', color: 'chartreuse' }],
                    finish: 'matte'
                }
            }));
            expect(res.ok).toBe(true);
            if (!res.ok) return;
            expect(res.paper.appearance?.baseColor).toBe('#2fa84f');
            // The unusable colour is dropped, the good one survives.
            expect(res.paper.appearance?.colorways).toHaveLength(1);
            expect(res.paper.appearance?.finish).toBe('matte');
        });

        it('refuses remote preprint artwork', () => {
            const res = parsePaperFile(wrap({ appearance: { artwork: { kind: 'image', src: 'https://tracker.example/a.png' } } }));
            expect(res.ok).toBe(true);
            if (!res.ok) return;
            expect(res.paper.appearance?.artwork).toBeUndefined();
            expect(res.warnings.join(' ')).toMatch(/embedded image data/i);
        });

        it('refuses preprint SVG carrying active content', () => {
            const res = parsePaperFile(wrap({ appearance: { artwork: { kind: 'svg', svg: '<svg onload="x()"><rect/></svg>' } } }));
            expect(res.ok).toBe(true);
            if (!res.ok) return;
            expect(res.paper.appearance?.artwork).toBeUndefined();
            expect(res.warnings.join(' ')).toMatch(/active content/i);
        });

        it('drops oversized preprint artwork', () => {
            const src = 'data:image/png;base64,' + 'A'.repeat(Math.round(PAPER_FILE_LIMITS.maxArtworkBytes / 0.75) + 4000);
            const res = parsePaperFile(wrap({ appearance: { artwork: { kind: 'image', src } } }));
            expect(res.ok).toBe(true);
            if (res.ok) expect(res.paper.appearance?.artwork).toBeUndefined();
        });
    });

    describe('inks', () => {
        it('keeps well-formed colorants and drops unusable ones', () => {
            const res = parsePaperFile(wrap({
                inks: [
                    { id: 'black', color: '#111111', primary: true, produced: { via: 'thermal' } },
                    { id: 'red', color: '#d2262c', produced: { via: 'thermal', energyBand: 'high' } },
                    { id: 'broken', color: 'red', produced: { via: 'thermal' } }
                ]
            }));
            expect(res.ok).toBe(true);
            if (!res.ok) return;
            expect(res.paper.inks!.map(i => i.id)).toEqual(['black', 'red']);
            expect(res.paper.inks![1].produced).toEqual({ via: 'thermal', energyBand: 'high' });
        });
    });
});

describe('per-element threshold in the shared format', () => {
    const base = {
        version: 1, kind: 'label-template', id: 't1', name: 'T',
        params: [], threshold: 128,
        adaptivity: { designedFor: { tapeWidthMm: 12, labelLengthMm: 40 } },
        elements: [{
            id: 'e1', type: 'shape', shape: 'rect',
            place: { anchor: 'tl', origin: 'tl', dx: { u: 'px', v: 0 }, dy: { u: 'px', v: 0 }, w: { u: 'px', v: 8 }, h: { u: 'px', v: 8 } },
            stroke: 1, fill: true
        }]
    };

    it('keeps an element cutoff and carries it onto the design', () => {
        const res = parseTemplate({ ...base, elements: [{ ...base.elements[0], monoThreshold: 200 }] });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.template.elements[0].monoThreshold).toBe(200);
        const { design } = resolveTemplate(res.template, { widthPx: 320, heightPx: 96, tapeWidthMm: 12 });
        expect(design.elements[0].monoThreshold).toBe(200);
    });

    it('leaves an element without one alone, so it follows the document', () => {
        const res = parseTemplate(base);
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.template.elements[0].monoThreshold).toBeUndefined();
    });

    it('clamps a cutoff that would make the element a solid block', () => {
        // 0 or 255 turns everything one colour; that is a mistake in someone
        // else's file, not a reason to refuse the whole template.
        const lo = parseTemplate({ ...base, elements: [{ ...base.elements[0], monoThreshold: 0 }] });
        const hi = parseTemplate({ ...base, elements: [{ ...base.elements[0], monoThreshold: 999 }] });
        expect(lo.ok && lo.template.elements[0].monoThreshold).toBe(1);
        expect(hi.ok && hi.template.elements[0].monoThreshold).toBe(254);
    });

    it('survives a design -> template round trip', () => {
        const d = design([{ ...box('a'), monoThreshold: 90 }]);
        const tpl = templateFromDesign(d, { adaptive: false });
        expect(tpl.elements[0].monoThreshold).toBe(90);
    });
});

describe('die geometry', () => {
    it('swaps the axes for a sideways-mounted die', () => {
        // A 40 x 60 tree on 40 mm tape is mounted at 90 degrees; reading the
        // axes straight off the roll would draw it 60 x 40.
        const upright = dieSize(paper({ tapeWidthMm: 40, labelLengthMm: 60 }));
        const sideways = dieSize(paper({ tapeWidthMm: 40, labelLengthMm: 60, mountRotationDeg: 90 }));
        expect(upright).toEqual({ widthMm: 60, heightMm: 40 });
        expect(sideways).toEqual({ widthMm: 40, heightMm: 60 });
    });

    it('always returns a real path, even for a plain rectangle', () => {
        expect(diePath(paper())).toBe('M0 0 H40 V12 H0 Z');
    });

    it('uses the corner radius when no die is declared', () => {
        expect(diePath(paper({ borderRadiusMm: 2 }))).toContain('A2 2');
    });

    it('never rounds a corner past half the shorter side', () => {
        // A radius bigger than that folds the outline through itself.
        const d = diePath(paper({ tapeWidthMm: 12, labelLengthMm: 40, borderRadiusMm: 99 }));
        expect(d).toContain('A6 6');
    });

    it('leaves continuous tape square', () => {
        expect(hasShapedDie(paper({ type: 'continuous', borderRadiusMm: 3 }))).toBe(false);
    });

    it('reports a shaped die for ellipses, paths and holes', () => {
        expect(hasShapedDie(paper({ die: { kind: 'ellipse' } }))).toBe(true);
        expect(hasShapedDie(paper({ die: { kind: 'path', dMm: 'M0 0 H1 V1 Z' } }))).toBe(true);
        expect(hasShapedDie(paper({ holesMm: ['M1 1 h1 v1 h-1 Z'] }))).toBe(true);
        expect(hasShapedDie(paper())).toBe(false);
    });
});
