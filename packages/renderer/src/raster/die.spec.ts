import { describe, it, expect } from 'vitest';
import { diePlacement, dieSize, hasShapedDie } from './die';
import type { PaperProfile } from 'universal-label-core';

/**
 * diePlacement maps label-space millimetres onto the printable canvas, and the
 * load-bearing detail it gets right is a die-cut sticker narrower than its
 * carrier: the die is scaled to its own width and centred on the web, not
 * stretched to the full tape height.
 */
function paper(extra: Partial<PaperProfile> = {}): PaperProfile {
    return {
        id: 'p',
        name: 'p',
        type: 'gap',
        tapeWidthMm: 15,
        labelLengthMm: 109,
        labelWidthMm: 12.5,
        die: { kind: 'path', dMm: 'M0 0 H109 V12.5 H0 Z' },
        ...extra,
    };
}

describe('diePlacement', () => {
    it('places a full-tape-width die with no inset', () => {
        const full: PaperProfile = { id: 'p', name: 'p', type: 'gap', tapeWidthMm: 15, labelLengthMm: 40 };
        // 40 mm long, 15 mm tall, on a 15 mm tape -> 320 x 120 px at 8 dpmm.
        const m = diePlacement(full, 320, 120)!;
        expect(m).not.toBeNull();
        // x: 0..40mm -> 0..320px ; y: 0..15mm -> 0..120px, no inset.
        expect(m.a).toBeCloseTo(8, 5);
        expect(m.d).toBeCloseTo(8, 5);
        expect(m.e).toBe(0);
        expect(m.f).toBe(0);
    });

    it('insets and scales a narrow die on a wider tape (rot 0)', () => {
        // 12.5 mm die on 15 mm tape: inset 1.25 mm each side, scaled to 12.5/15 of the height.
        const m = diePlacement(paper(), 872, 120)!;
        const size = dieSize(paper());
        // along (feed, x): 0..109mm -> 0..872px -> 8 px/mm
        expect(m.a).toBeCloseTo(872 / size.widthMm, 5);
        // across (tape, y): the die spans 12.5mm, rendered into 120px that represent 15mm,
        // so the scale is (120 * 12.5 / 15) / 12.5 = 8 px/mm, and shifted by 1.25mm * 8 = 10px.
        expect(m.d).toBeCloseTo(8, 5);
        expect(m.f).toBeCloseTo(10, 5);
        // A point at the die's top edge (y=0) lands at the inset, not at y=0.
        expect(m.f).toBeGreaterThan(0);
    });

    it('keeps the die within the canvas, not stretched to the full tape height', () => {
        const m = diePlacement(paper(), 872, 120)!;
        // The die's bottom edge (y = 12.5mm) must land at insetPx + 12.5mm*8 = 10 + 100 = 110px,
        // strictly inside the 120px tape, leaving 10px of margin at the bottom too.
        const bottomPx = m.b * 0 + m.d * 12.5 + m.f;
        expect(bottomPx).toBeCloseTo(110, 4);
        expect(bottomPx).toBeLessThan(120);
    });

    it('returns null for a degenerate size', () => {
        const zero: PaperProfile = { id: 'p', name: 'p', type: 'continuous', tapeWidthMm: 15 };
        // continuous with no label length -> dieSize height = tapeWidthMm (15), width = tapeWidthMm.
        // Force a zero-width path: not representable, so guard via a paper with labelLengthMm 0.
        const deg: PaperProfile = { ...paper(), labelLengthMm: 0 } as PaperProfile;
        expect(diePlacement(deg, 100, 100)).toBeNull();
        void zero;
    });

    it('agrees with hasShapedDie about whether there is anything to place', () => {
        const shaped = paper();
        const plain: PaperProfile = { id: 'p', name: 'p', type: 'gap', tapeWidthMm: 15, labelLengthMm: 40 };
        expect(hasShapedDie(shaped)).toBe(true);
        expect(diePlacement(shaped, 100, 100)).not.toBeNull();
        expect(hasShapedDie(plain)).toBe(false);
        // diePlacement still returns a matrix for a plain rect; callers gate on hasShapedDie.
        expect(diePlacement(plain, 100, 100)).not.toBeNull();
    });
});
