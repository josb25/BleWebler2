import { describe, it, expect } from 'vitest';
import { svgToPath, SvgImportError } from './svgimport';
import { parsePath, pathBounds, isValidPath, PathError } from './svgpath';

const wrap = (body: string, vb = '0 0 100 100'): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${body}</svg>`;

describe('path parsing', () => {
    it('normalises relative commands to absolute', () => {
        const cmds = parsePath('m10 10 l10 0 l0 10 z');
        expect(cmds).toEqual([
            { t: 'M', x: 10, y: 10 },
            { t: 'L', x: 20, y: 10 },
            { t: 'L', x: 20, y: 20 },
            { t: 'Z' }
        ]);
    });

    it('treats extra pairs after M as implicit linetos', () => {
        expect(parsePath('M0 0 10 0 10 10').map(c => c.t)).toEqual(['M', 'L', 'L']);
    });

    it('promotes quadratics to cubics and resolves the T shorthand', () => {
        const cmds = parsePath('M0 0 Q10 10 20 0 T40 0');
        expect(cmds.map(c => c.t)).toEqual(['M', 'C', 'C']);
    });

    it('reflects the S control point off the previous cubic', () => {
        const [, , second] = parsePath('M0 0 C0 10 10 10 10 0 S20 -10 20 0');
        // Previous second control was (10,10) about the point (10,0),
        // so the reflection is (10,-10).
        expect(second).toMatchObject({ t: 'C', x1: 10, y1: -10 });
    });

    it('converts arcs to curves that stay on the circle', () => {
        // A half circle from (0,0) to (20,0) with r=10.
        const cmds = parsePath('M0 0 A10 10 0 0 1 20 0');
        const b = pathBounds(cmds);
        expect(b.minX).toBeCloseTo(0, 3);
        expect(b.maxX).toBeCloseTo(20, 3);
        expect(cmds.every(c => c.t === 'M' || c.t === 'C')).toBe(true);
    });

    it('rejects malformed data rather than guessing', () => {
        expect(() => parsePath('M0')).toThrow(PathError);           // odd argument count
        expect(() => parsePath('M0 0 K5 5')).toThrow(PathError);    // unknown command
        expect(isValidPath('M0 0L10 10Z')).toBe(true);
        expect(isValidPath('nonsense')).toBe(false);
    });

    it('enforces the size budget', () => {
        expect(() => parsePath('M0 0' + 'L1 1'.repeat(30_000))).toThrow(PathError);
    });
});

describe('SVG import — geometry only', () => {
    it('converts the basic shapes', () => {
        for (const body of [
            '<rect x="10" y="10" width="30" height="20"/>',
            '<circle cx="50" cy="50" r="20"/>',
            '<ellipse cx="50" cy="50" rx="30" ry="10"/>',
            '<line x1="0" y1="0" x2="50" y2="50"/>',
            '<polygon points="0,0 50,0 25,40"/>',
            '<polyline points="0,0 50,0 25,40"/>'
        ]) {
            const r = svgToPath(wrap(body));
            expect(isValidPath(r.d), body).toBe(true);
        }
    });

    it('keeps the declared viewBox', () => {
        const r = svgToPath(wrap('<rect x="0" y="0" width="10" height="10"/>', '0 0 24 24'));
        expect(r.viewBox).toEqual([0, 0, 24, 24]);
    });

    it('derives a viewBox from the geometry when none is declared', () => {
        const r = svgToPath('<svg><rect x="10" y="20" width="30" height="40"/></svg>');
        expect(r.viewBox[0]).toBeCloseTo(10);
        expect(r.viewBox[1]).toBeCloseTo(20);
        expect(r.viewBox[2]).toBeCloseTo(30);
        expect(r.viewBox[3]).toBeCloseTo(40);
    });

    it('flattens transforms, including nested groups', () => {
        const plain = svgToPath(wrap('<rect x="10" y="10" width="10" height="10"/>'));
        const moved = svgToPath(wrap('<g transform="translate(5 5)"><rect x="5" y="5" width="10" height="10"/></g>'));
        expect(pathBounds(parsePath(moved.d))).toEqual(pathBounds(parsePath(plain.d)));
    });

    it('applies scale and rotate', () => {
        const r = svgToPath(wrap('<g transform="scale(2)"><rect x="0" y="0" width="10" height="10"/></g>'));
        const b = pathBounds(parsePath(r.d));
        expect(b.maxX).toBeCloseTo(20);
        expect(b.maxY).toBeCloseTo(20);
    });

    it('honours fill-rule so holes survive', () => {
        const r = svgToPath(wrap('<path fill-rule="evenodd" d="M0 0h100v100H0ZM20 20h60v60H20Z"/>'));
        expect(r.fillRule).toBe('evenodd');
    });
});

describe('SVG import — the security gate', () => {
    it('drops script and reports it, keeping the geometry', () => {
        const r = svgToPath(wrap('<script>alert(1)</script><rect x="0" y="0" width="10" height="10"/>'));
        expect(r.d).not.toMatch(/alert/);
        expect(isValidPath(r.d)).toBe(true);
    });

    it('never carries an external reference through', () => {
        const r = svgToPath(wrap(
            '<image href="https://evil.example/x.png" x="0" y="0" width="10" height="10"/>'
            + '<rect x="0" y="0" width="10" height="10"/>'
        ));
        expect(r.d).not.toMatch(/http|href|evil/);
        expect(r.skipped).not.toContain('rect');
    });

    it('drops foreignObject, use and text, and says so', () => {
        const r = svgToPath(wrap(
            '<foreignObject><b>hi</b></foreignObject><use href="#a"/><rect x="0" y="0" width="4" height="4"/>'
        ));
        expect(r.skipped).toContain('use');
        expect(isValidPath(r.d)).toBe(true);
    });

    it('does not mistake markup inside comments for geometry', () => {
        const r = svgToPath(wrap('<!-- <rect x="0" y="0" width="999" height="999"/> --><rect x="0" y="0" width="10" height="10"/>'));
        const b = pathBounds(parsePath(r.d));
        expect(b.maxX).toBeCloseTo(10);
    });

    it('refuses a document with nothing drawable', () => {
        expect(() => svgToPath(wrap('<script>x</script>'))).toThrow(SvgImportError);
        expect(() => svgToPath(wrap('<text x="0" y="0">hello</text>'))).toThrow(SvgImportError);
        expect(() => svgToPath('')).toThrow(SvgImportError);
    });

    it('caps the input size', () => {
        expect(() => svgToPath('<svg>' + ' '.repeat(600_000) + '</svg>')).toThrow(/too large/);
    });

    it('output is inert: it re-parses as pure geometry', () => {
        const r = svgToPath(wrap('<path d="M0 0C10 10 20 10 30 0Z"/>'));
        // Whatever came in, what comes out is only M/L/C/Z.
        expect(parsePath(r.d).every(c => ['M', 'L', 'C', 'Z'].includes(c.t))).toBe(true);
    });
});
