import { describe, it, expect } from 'vitest';
import { applyRotation } from './rasterize';
import { rotatedBounds } from './measure';
import type { AnyElement } from '../model/design';

/**
 * A context stand-in that records what was applied and can map a point the way
 * the canvas would, so the transform can be checked without a real canvas.
 */
function fakeCtx() {
    // [a, b, c, d, e, f]: (x,y) -> (a*x + c*y + e, b*x + d*y + f)
    let m = [1, 0, 0, 1, 0, 0];
    const calls: string[] = [];
    return {
        calls,
        matrix: () => m,
        map(x: number, y: number): [number, number] {
            return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
        },
        transform(a: number, b: number, c: number, d: number, e: number, f: number) {
            calls.push('transform');
            m = [
                m[0] * a + m[2] * b, m[1] * a + m[3] * b,
                m[0] * c + m[2] * d, m[1] * c + m[3] * d,
                m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]
            ];
        },
        translate(x: number, y: number) {
            calls.push('translate');
            m = [m[0], m[1], m[2], m[3], m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
        },
        rotate(rad: number) {
            calls.push('rotate');
            const cos = Math.cos(rad), sin = Math.sin(rad);
            m = [
                m[0] * cos + m[2] * sin, m[1] * cos + m[3] * sin,
                m[0] * -sin + m[2] * cos, m[1] * -sin + m[3] * cos,
                m[4], m[5]
            ];
        }
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rotate = (ctx: ReturnType<typeof fakeCtx>, deg: number, cx: number, cy: number) =>
    applyRotation(ctx as any, deg, cx, cy);

describe('right-angle rotation stays on the pixel grid', () => {
    // A half-pixel centre can smear glyphs into grey:
    // an 18x15 element at (10,10) has its centre at (19, 17.5).
    const CX = 19, CY = 17.5;

    for (const deg of [90, 180, 270]) {
        it(`maps integer pixels to integer pixels at ${deg}°`, () => {
            const ctx = fakeCtx();
            rotate(ctx, deg, CX, CY);
            for (const [x, y] of [[0, 0], [10, 10], [27, 24], [3, 19]]) {
                const [px, py] = ctx.map(x, y);
                expect(Number.isInteger(px), `x at ${deg}° from ${x},${y} -> ${px}`).toBe(true);
                expect(Number.isInteger(py), `y at ${deg}° from ${x},${y} -> ${py}`).toBe(true);
            }
        });

        it(`uses an exact integer matrix at ${deg}° (no trigonometry)`, () => {
            const ctx = fakeCtx();
            rotate(ctx, deg, CX, CY);
            expect(ctx.calls).toEqual(['transform']);
            // Math.cos(PI/2) is 6.1e-17, not 0 — the rotate() path can never
            // produce a clean matrix, which is why right angles bypass it.
            for (const v of ctx.matrix()) expect(Number.isInteger(v)).toBe(true);
        });
    }

    it('rotates in the same direction as the trigonometric path', () => {
        // Same corner, both paths: snapping must not flip or mirror anything.
        for (const deg of [90, 180, 270]) {
            const exact = fakeCtx();
            rotate(exact, deg, CX, CY);
            const smooth = fakeCtx();
            // The pre-fix implementation, for comparison.
            smooth.translate(CX, CY);
            smooth.rotate((deg * Math.PI) / 180);
            smooth.translate(-CX, -CY);
            const a = exact.map(28, 25);
            const b = smooth.map(28, 25);
            // Snapping a half-pixel centre shifts by at most half a pixel —
            // that is the whole point. Anything more would mean a flip.
            expect(Math.abs(a[0] - b[0]), `x at ${deg}°`).toBeLessThanOrEqual(0.5 + 1e-9);
            expect(Math.abs(a[1] - b[1]), `y at ${deg}°`).toBeLessThanOrEqual(0.5 + 1e-9);
        }
    });

    it('preserves distances — a rotation, not a scale', () => {
        const ctx = fakeCtx();
        rotate(ctx, 90, CX, CY);
        const p = ctx.map(4, 7);
        const q = ctx.map(24, 7);
        expect(Math.hypot(q[0] - p[0], q[1] - p[1])).toBeCloseTo(20, 6);
    });

    it('leaves free angles on the smooth path', () => {
        const ctx = fakeCtx();
        rotate(ctx, 37, CX, CY);
        expect(ctx.calls).toEqual(['translate', 'rotate', 'translate']);
    });

    it('does nothing at 0°', () => {
        const ctx = fakeCtx();
        rotate(ctx, 0, CX, CY);
        expect(ctx.calls).toEqual([]);
        expect(ctx.map(5, 9)).toEqual([5, 9]);
    });

    it('snaps an integer centre without moving anything', () => {
        // Whole-pixel centres were already fine; the fix must not disturb them.
        const ctx = fakeCtx();
        rotate(ctx, 90, 20, 16);
        expect(ctx.map(20, 16)).toEqual([20, 16]); // the pivot is fixed
    });
});

describe('rotatedBounds', () => {
    // A shape has an exact, measurer-free size, so the numbers are checkable.
    const box = (rotation: number): AnyElement => ({
        type: 'shape', id: 's', x: 10, y: 20, shape: 'rect',
        width: 40, height: 12, stroke: 1, fill: false, rotation
    });

    it('swaps the sides at right angles, exactly', () => {
        const a = rotatedBounds(box(90));
        expect(a.width).toBe(12);
        expect(a.height).toBe(40);
        // Math.cos(PI/2) is 6.1e-17, so a trigonometric version would produce
        // 39.99999999999999 here and round inconsistently downstream.
        expect(Number.isInteger(a.width) && Number.isInteger(a.height)).toBe(true);
        expect(rotatedBounds(box(270)).width).toBe(12);
        expect(rotatedBounds(box(180)).width).toBe(40);
    });

    it('keeps the centre fixed — rotation moves nothing else', () => {
        const centre = (r: number) => {
            const b = rotatedBounds(box(r));
            return [b.x + b.width / 2, b.y + b.height / 2];
        };
        const at0 = centre(0);
        for (const r of [90, 180, 270, 37]) expect(centre(r)).toEqual(at0);
    });

    it('computes the true bounding box at a free angle', () => {
        // A long flat box turned 45 deg gets *narrower* than its length — the
        // long side no longer lies on the axis — so "rotation always grows the
        // box" is not the invariant. Both sides span (40+12)/sqrt(2).
        const b = rotatedBounds(box(45));
        expect(b.width).toBeCloseTo(52 / Math.SQRT2, 6);
        expect(b.height).toBeCloseTo(52 / Math.SQRT2, 6);
        // What does hold: never smaller than the short side, never larger than
        // the diagonal.
        const diag = Math.hypot(40, 12);
        for (const v of [b.width, b.height]) {
            expect(v).toBeGreaterThanOrEqual(12);
            expect(v).toBeLessThanOrEqual(diag + 1e-9);
        }
    });

    it('reports the unrotated content size alongside', () => {
        const b = rotatedBounds(box(90));
        expect([b.contentW, b.contentH]).toEqual([40, 12]);
    });

    it('is a no-op without rotation', () => {
        const b = rotatedBounds(box(0));
        expect([b.x, b.y, b.width, b.height]).toEqual([10, 20, 40, 12]);
    });
});
