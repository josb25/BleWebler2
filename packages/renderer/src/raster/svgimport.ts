/**
 * SVG document -> a single sanitised path.
 *
 * This is the gate that lets users bring *any* icon without letting an SVG
 * document into the renderer. Only geometry survives: `<path>` and the basic
 * shapes, flattened through their transforms into one absolute path. Anything
 * that could reference, execute, or fetch — script, style, image, use,
 * foreignObject, text, external hrefs — is dropped and reported, so the result
 * is inert data that renders identically headless.
 *
 * The scanner is a small tag reader rather than a DOM parse so it works in the
 * headless print path and in tests, not just in a browser.
 */

import { parsePath, pathBounds, PathError, type PathCmd } from './svgpath';

export interface SvgImportResult {
    /** Absolute path data, ready for {@link parsePath}. */
    d: string;
    /** The box the path lives in: [minX, minY, width, height]. */
    viewBox: [number, number, number, number];
    fillRule: 'nonzero' | 'evenodd';
    /** Tag names that were ignored, for an honest message in the UI. */
    skipped: string[];
}

export class SvgImportError extends Error {}

const MAX_SVG_BYTES = 512 * 1024;

/** Tags we turn into geometry. Everything else is dropped. */
const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
/** Dropped silently — structural, no geometry of their own. */
const STRUCTURAL = new Set(['svg', 'g', 'defs', 'title', 'desc', 'metadata', 'clippath', 'mask', 'symbol']);

type Matrix = [number, number, number, number, number, number]; // a b c d e f
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, n: Matrix): Matrix {
    return [
        m[0] * n[0] + m[2] * n[1],
        m[1] * n[0] + m[3] * n[1],
        m[0] * n[2] + m[2] * n[3],
        m[1] * n[2] + m[3] * n[3],
        m[0] * n[4] + m[2] * n[5] + m[4],
        m[1] * n[4] + m[3] * n[5] + m[5]
    ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

const numbers = (s: string): number[] =>
    (s.match(/[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g) ?? []).map(Number);

function parseTransform(value: string): Matrix {
    let m: Matrix = IDENTITY;
    const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
    let hit: RegExpExecArray | null;
    while ((hit = re.exec(value)) !== null) {
        const a = numbers(hit[2]);
        let next: Matrix = IDENTITY;
        switch (hit[1]) {
            case 'matrix':
                if (a.length >= 6) next = [a[0], a[1], a[2], a[3], a[4], a[5]];
                break;
            case 'translate':
                next = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
                break;
            case 'scale':
                next = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
                break;
            case 'rotate': {
                const r = ((a[0] ?? 0) * Math.PI) / 180;
                const cos = Math.cos(r), sin = Math.sin(r);
                const rot: Matrix = [cos, sin, -sin, cos, 0, 0];
                if (a.length >= 3) {
                    next = multiply(multiply([1, 0, 0, 1, a[1], a[2]], rot), [1, 0, 0, 1, -a[1], -a[2]]);
                } else next = rot;
                break;
            }
            case 'skewX':
                next = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
                break;
            case 'skewY':
                next = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
                break;
        }
        m = multiply(m, next);
    }
    return m;
}

/** Basic shapes expressed as path data, so there is one geometry path downstream. */
function shapeToPathData(tag: string, at: Record<string, string>): string | null {
    const n = (k: string, fallback = 0): number => {
        const v = parseFloat(at[k]);
        return Number.isFinite(v) ? v : fallback;
    };
    switch (tag) {
        case 'path':
            return at.d ?? null;
        case 'rect': {
            const x = n('x'), y = n('y'), w = n('width'), h = n('height');
            if (w <= 0 || h <= 0) return null;
            let rx = at.rx !== undefined ? n('rx') : (at.ry !== undefined ? n('ry') : 0);
            let ry = at.ry !== undefined ? n('ry') : rx;
            rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
            if (rx <= 0 || ry <= 0) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
            return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}`
                + `V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}`
                + `H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}`
                + `V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
        }
        case 'circle': {
            const cx = n('cx'), cy = n('cy'), r = n('r');
            if (r <= 0) return null;
            return `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`;
        }
        case 'ellipse': {
            const cx = n('cx'), cy = n('cy'), rx = n('rx'), ry = n('ry');
            if (rx <= 0 || ry <= 0) return null;
            return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
        }
        case 'line':
            return `M${n('x1')} ${n('y1')}L${n('x2')} ${n('y2')}`;
        case 'polyline':
        case 'polygon': {
            const p = numbers(at.points ?? '');
            if (p.length < 4) return null;
            let d = `M${p[0]} ${p[1]}`;
            for (let i = 2; i + 1 < p.length; i += 2) d += `L${p[i]} ${p[i + 1]}`;
            return tag === 'polygon' ? d + 'Z' : d;
        }
        default:
            return null;
    }
}

const ATTR = /([:\w-]+)\s*=\s*("[^"]*"|'[^']*')/g;

function attributes(raw: string): Record<string, string> {
    const out: Record<string, string> = {};
    ATTR.lastIndex = 0;
    let hit: RegExpExecArray | null;
    while ((hit = ATTR.exec(raw)) !== null) {
        out[hit[1].toLowerCase()] = hit[2].slice(1, -1);
    }
    return out;
}

function serialize(cmds: readonly PathCmd[]): string {
    const r = (v: number): string => {
        const s = Math.abs(v) < 1e-6 ? '0' : v.toFixed(3).replace(/\.?0+$/, '');
        return s === '-0' ? '0' : s;
    };
    let out = '';
    for (const c of cmds) {
        if (c.t === 'Z') { out += 'Z'; continue; }
        if (c.t === 'M') { out += `M${r(c.x)} ${r(c.y)}`; continue; }
        if (c.t === 'L') { out += `L${r(c.x)} ${r(c.y)}`; continue; }
        out += `C${r(c.x1)} ${r(c.y1)} ${r(c.x2)} ${r(c.y2)} ${r(c.x)} ${r(c.y)}`;
    }
    return out;
}

/**
 * Flatten an SVG document into one sanitised path.
 * Throws {@link SvgImportError} when nothing drawable survives.
 */
export function svgToPath(svg: string): SvgImportResult {
    if (typeof svg !== 'string' || svg.length === 0) throw new SvgImportError('Empty SVG.');
    if (svg.length > MAX_SVG_BYTES) throw new SvgImportError('SVG is too large (max 512 KB).');

    // Strip comments, CDATA and the contents of anything executable or textual
    // before scanning, so their attributes can never be read as geometry.
    const cleaned = svg
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
        .replace(/<\s*(script|style|text|foreignObject|image)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '');

    const skipped = new Set<string>();
    const stack: Matrix[] = [IDENTITY];
    const cmds: PathCmd[] = [];
    let fillRule: 'nonzero' | 'evenodd' = 'nonzero';
    let viewBox: [number, number, number, number] | null = null;

    const TAG = /<\s*(\/?)\s*([\w:-]+)([^>]*?)(\/?)\s*>/g;
    let hit: RegExpExecArray | null;
    while ((hit = TAG.exec(cleaned)) !== null) {
        const closing = hit[1] === '/';
        const tag = hit[2].toLowerCase().replace(/^svg:/, '');
        const at = attributes(hit[3]);
        const selfClosing = hit[4] === '/';

        if (closing) {
            if (stack.length > 1) stack.pop();
            continue;
        }

        const local = at.transform ? parseTransform(at.transform) : IDENTITY;
        const world = multiply(stack[stack.length - 1], local);

        if (tag === 'svg' && viewBox === null) {
            const vb = numbers(at.viewbox ?? '');
            if (vb.length === 4) viewBox = [vb[0], vb[1], vb[2], vb[3]];
            else {
                const w = parseFloat(at.width), h = parseFloat(at.height);
                if (Number.isFinite(w) && Number.isFinite(h)) viewBox = [0, 0, w, h];
            }
        }

        if (SHAPES.has(tag)) {
            const d = shapeToPathData(tag, at);
            if (d) {
                try {
                    for (const c of parsePath(d)) {
                        if (c.t === 'Z') { cmds.push(c); continue; }
                        if (c.t === 'C') {
                            const [x1, y1] = apply(world, c.x1, c.y1);
                            const [x2, y2] = apply(world, c.x2, c.y2);
                            const [x, y] = apply(world, c.x, c.y);
                            cmds.push({ t: 'C', x1, y1, x2, y2, x, y });
                            continue;
                        }
                        const [x, y] = apply(world, c.x, c.y);
                        cmds.push({ t: c.t, x, y });
                    }
                    if ((at['fill-rule'] ?? at.clipRule) === 'evenodd') fillRule = 'evenodd';
                } catch (err) {
                    if (!(err instanceof PathError)) throw err;
                    skipped.add(tag);
                }
            }
        } else if (!STRUCTURAL.has(tag)) {
            skipped.add(tag);
        }

        // Groups keep their transform for their children; leaves do not nest.
        if (!selfClosing && (tag === 'g' || tag === 'svg')) stack.push(world);
    }

    if (cmds.length === 0) {
        throw new SvgImportError(
            'No drawable geometry found. Paths and basic shapes are supported; text must be converted to outlines first.'
        );
    }

    if (!viewBox) {
        const b = pathBounds(cmds);
        viewBox = [b.minX, b.minY, Math.max(1e-6, b.maxX - b.minX), Math.max(1e-6, b.maxY - b.minY)];
    }
    return { d: serialize(cmds), viewBox, fillRule, skipped: [...skipped] };
}
