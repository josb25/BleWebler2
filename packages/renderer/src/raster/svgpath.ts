/**
 * SVG path data — parsed into a normalised command list, then drawn with plain
 * 2D-context calls.
 *
 * Why parse rather than hand the SVG to the platform: rendering an `<svg>` needs
 * a full SVG engine, which the headless print path does not have, and which
 * would drag script/`<foreignObject>`/external-reference surface into a format
 * whose entire premise is that **importing is data validation, never code
 * execution** (see safe-expr.ts for the same reasoning applied to expressions).
 * A path `d` string is pure geometry: it cannot reference anything, cannot
 * execute, and renders identically in the browser and in Node.
 *
 * Everything normalises to M / L / C / Z — arcs and the shorthand curve forms
 * are converted here — so the drawing side has four cases and no state.
 */

export class PathError extends Error {}

export type PathCmd =
    | { t: 'M'; x: number; y: number }
    | { t: 'L'; x: number; y: number }
    | { t: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { t: 'Z' };

/** Bounds on untrusted input, in the spirit of the expression engine's budgets. */
export const PATH_LIMITS = { maxLength: 100_000, maxCommands: 20_000 };

const NUM = /[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g;

/** Split a path string into command letters and their numeric arguments. */
function tokenize(d: string): Array<{ cmd: string; args: number[] }> {
    const out: Array<{ cmd: string; args: number[] }> = [];
    // Walk letter by letter; everything between two letters belongs to the first.
    let i = 0;
    while (i < d.length) {
        const ch = d[i];
        if (!/[a-zA-Z]/.test(ch)) { i++; continue; }
        let j = i + 1;
        while (j < d.length && !/[a-zA-Z]/.test(d[j])) j++;
        const chunk = d.slice(i + 1, j);
        NUM.lastIndex = 0;
        const args = (chunk.match(NUM) ?? []).map(Number);
        if (args.some(n => !Number.isFinite(n))) throw new PathError('Non-finite number in path data.');
        out.push({ cmd: ch, args });
        i = j;
    }
    return out;
}

/** How many arguments each command consumes per repetition. */
const ARITY: Record<string, number> = {
    m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0
};

/**
 * Convert one SVG elliptical arc to cubic BÃ©ziers (endpoint -> centre
 * parameterisation, then split into <=90Â° segments).
 */
function arcToCurves(
    x0: number, y0: number,
    rxIn: number, ryIn: number, angleDeg: number,
    largeArc: boolean, sweep: boolean,
    x: number, y: number
): PathCmd[] {
    if (x0 === x && y0 === y) return [];
    let rx = Math.abs(rxIn), ry = Math.abs(ryIn);
    if (rx === 0 || ry === 0) return [{ t: 'L', x, y }];

    const phi = (angleDeg * Math.PI) / 180;
    const cosP = Math.cos(phi), sinP = Math.sin(phi);
    const dx2 = (x0 - x) / 2, dy2 = (y0 - y) / 2;
    const x1p = cosP * dx2 + sinP * dy2;
    const y1p = -sinP * dx2 + cosP * dy2;

    // Scale the radii up if they are too small to span the endpoints.
    const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lambda > 1) {
        const s = Math.sqrt(lambda);
        rx *= s; ry *= s;
    }

    const sign = largeArc === sweep ? -1 : 1;
    const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    const co = sign * Math.sqrt(Math.max(0, num / den));
    const cxp = (co * rx * y1p) / ry;
    const cyp = (-co * ry * x1p) / rx;
    const cx = cosP * cxp - sinP * cyp + (x0 + x) / 2;
    const cy = sinP * cxp + cosP * cyp + (y0 + y) / 2;

    const angleOf = (ux: number, uy: number, vx: number, vy: number): number => {
        const dot = ux * vx + uy * vy;
        const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
        let a = Math.acos(Math.min(1, Math.max(-1, dot / (len || 1))));
        if (ux * vy - uy * vx < 0) a = -a;
        return a;
    };
    const theta1 = angleOf(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dTheta = angleOf((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
    if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

    const segments = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
    const delta = dTheta / segments;
    // Magic constant for approximating a circular arc of `delta` with a cubic.
    const k = (4 / 3) * Math.tan(delta / 4);

    const out: PathCmd[] = [];
    let th = theta1;
    let px = x0, py = y0;
    for (let s = 0; s < segments; s++) {
        const th2 = th + delta;
        const cos1 = Math.cos(th), sin1 = Math.sin(th);
        const cos2 = Math.cos(th2), sin2 = Math.sin(th2);
        // Derivatives at both ends, mapped back through the rotation.
        const e = (ct: number, st: number): [number, number] => [
            cosP * rx * ct - sinP * ry * st + cx,
            sinP * rx * ct + cosP * ry * st + cy
        ];
        const d1 = (ct: number, st: number): [number, number] => [
            -cosP * rx * st - sinP * ry * ct,
            -sinP * rx * st + cosP * ry * ct
        ];
        const [ex, ey] = e(cos2, sin2);
        const [t1x, t1y] = d1(cos1, sin1);
        const [t2x, t2y] = d1(cos2, sin2);
        out.push({
            t: 'C',
            x1: px + k * t1x, y1: py + k * t1y,
            x2: ex - k * t2x, y2: ey - k * t2y,
            x: ex, y: ey
        });
        px = ex; py = ey;
        th = th2;
    }
    return out;
}

/**
 * Parse SVG path data into normalised absolute M/L/C/Z commands.
 * Throws {@link PathError} on malformed input or when the budgets are exceeded.
 */
export function parsePath(d: string): PathCmd[] {
    if (typeof d !== 'string') throw new PathError('Path data must be a string.');
    if (d.length > PATH_LIMITS.maxLength) throw new PathError('Path data is too large.');

    const out: PathCmd[] = [];
    let cx = 0, cy = 0;        // current point
    let sx = 0, sy = 0;        // subpath start
    // Previous control points, for the S/T shorthands. Held as scalars rather
    // than tuples on purpose: a nullable tuple would make the reflected point's
    // type depend on a value derived from itself, which TypeScript rejects as
    // circular.
    let lastCx = 0, lastCy = 0, hasC = false;
    let lastQx = 0, lastQy = 0, hasQ = false;

    /** A quadratic promoted to a cubic — the drawing side only knows cubics. */
    const quadTo = (qx: number, qy: number, x: number, y: number): void => {
        out.push({
            t: 'C',
            x1: cx + (2 / 3) * (qx - cx), y1: cy + (2 / 3) * (qy - cy),
            x2: x + (2 / 3) * (qx - x), y2: y + (2 / 3) * (qy - y),
            x, y
        });
    };

    for (const { cmd, args } of tokenize(d)) {
        const lower = cmd.toLowerCase();
        const rel = cmd !== cmd.toUpperCase();
        const arity = ARITY[lower];
        if (arity === undefined) throw new PathError(`Unsupported path command "${cmd}".`);
        if (arity === 0) {
            out.push({ t: 'Z' });
            cx = sx; cy = sy;
            hasC = hasQ = false;
            continue;
        }
        if (args.length === 0 || args.length % arity !== 0) {
            throw new PathError(`Command "${cmd}" has ${args.length} arguments, expected a multiple of ${arity}.`);
        }
        for (let k = 0; k < args.length; k += arity) {
            const a = args.slice(k, k + arity);
            const ax = (v: number): number => (rel ? cx + v : v);
            const ay = (v: number): number => (rel ? cy + v : v);
            switch (lower) {
                case 'm': {
                    const x = ax(a[0]), y = ay(a[1]);
                    // Only the first pair is a move; the rest are implicit linetos.
                    if (k === 0) { out.push({ t: 'M', x, y }); sx = x; sy = y; }
                    else out.push({ t: 'L', x, y });
                    cx = x; cy = y; hasC = hasQ = false;
                    break;
                }
                case 'l': {
                    const x = ax(a[0]), y = ay(a[1]);
                    out.push({ t: 'L', x, y }); cx = x; cy = y; hasC = hasQ = false;
                    break;
                }
                case 'h': {
                    const x = ax(a[0]);
                    out.push({ t: 'L', x, y: cy }); cx = x; hasC = hasQ = false;
                    break;
                }
                case 'v': {
                    const y = ay(a[0]);
                    out.push({ t: 'L', x: cx, y }); cy = y; hasC = hasQ = false;
                    break;
                }
                case 'c': {
                    const x1 = ax(a[0]), y1 = ay(a[1]), x2 = ax(a[2]), y2 = ay(a[3]);
                    const x = ax(a[4]), y = ay(a[5]);
                    out.push({ t: 'C', x1, y1, x2, y2, x, y });
                    lastCx = x2; lastCy = y2; hasC = true; hasQ = false; cx = x; cy = y;
                    break;
                }
                case 's': {
                    // Reflect the previous cubic's second control point. The
                    // annotation is load-bearing: without it the inferred type
                    // of `lastC` would depend on a value derived from itself.
                    const px = hasC ? lastCx : cx, py = hasC ? lastCy : cy;
                    const x1 = 2 * cx - px, y1 = 2 * cy - py;
                    const x2 = ax(a[0]), y2 = ay(a[1]), x = ax(a[2]), y = ay(a[3]);
                    out.push({ t: 'C', x1, y1, x2, y2, x, y });
                    lastCx = x2; lastCy = y2; hasC = true; hasQ = false; cx = x; cy = y;
                    break;
                }
                case 'q': {
                    const qx = ax(a[0]), qy = ay(a[1]), x = ax(a[2]), y = ay(a[3]);
                    quadTo(qx, qy, x, y);
                    lastQx = qx; lastQy = qy; hasQ = true; hasC = false; cx = x; cy = y;
                    break;
                }
                case 't': {
                    const px = hasQ ? lastQx : cx, py = hasQ ? lastQy : cy;
                    const qx = 2 * cx - px, qy = 2 * cy - py;
                    const x = ax(a[0]), y = ay(a[1]);
                    quadTo(qx, qy, x, y);
                    lastQx = qx; lastQy = qy; hasQ = true; hasC = false; cx = x; cy = y;
                    break;
                }
                case 'a': {
                    const x = ax(a[5]), y = ay(a[6]);
                    out.push(...arcToCurves(cx, cy, a[0], a[1], a[2], a[3] !== 0, a[4] !== 0, x, y));
                    hasC = hasQ = false; cx = x; cy = y;
                    break;
                }
            }
            if (out.length > PATH_LIMITS.maxCommands) throw new PathError('Path has too many commands.');
        }
    }
    return out;
}

/** True if `d` parses — for live validation in the editor. */
export function isValidPath(d: string): boolean {
    try { parsePath(d); return true; } catch { return false; }
}

export interface PathBounds { minX: number; minY: number; maxX: number; maxY: number; }

/**
 * Tight-ish bounds. Curves are bounded by their control hull, which slightly
 * over-estimates but never clips — the right side to err on for auto-fitting.
 */
export function pathBounds(cmds: readonly PathCmd[]): PathBounds {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const hit = (x: number, y: number): void => {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    };
    for (const c of cmds) {
        if (c.t === 'Z') continue;
        if (c.t === 'C') { hit(c.x1, c.y1); hit(c.x2, c.y2); }
        hit(c.x, c.y);
    }
    if (minX > maxX) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    return { minX, minY, maxX, maxY };
}

interface PathSink {
    beginPath(): void;
    closePath(): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void;
}

/** Replay a parsed path into a 2D context, mapping each point through `tx`. */
export function tracePath(
    ctx: PathSink,
    cmds: readonly PathCmd[],
    tx: (x: number, y: number) => [number, number]
): void {
    ctx.beginPath();
    for (const c of cmds) {
        if (c.t === 'Z') { ctx.closePath(); continue; }
        if (c.t === 'M') { const [x, y] = tx(c.x, c.y); ctx.moveTo(x, y); continue; }
        if (c.t === 'L') { const [x, y] = tx(c.x, c.y); ctx.lineTo(x, y); continue; }
        const [x1, y1] = tx(c.x1, c.y1);
        const [x2, y2] = tx(c.x2, c.y2);
        const [x, y] = tx(c.x, c.y);
        ctx.bezierCurveTo(x1, y1, x2, y2, x, y);
    }
}
