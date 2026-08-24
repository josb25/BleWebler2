/**
 * Responsive dimensions + placement — the geometry half of the template
 * engine, and the reason a template is printer- and label-agnostic.
 *
 * A {@link Dim} is a length that may be absolute (px/mm) or relative (% of the
 * canvas, or a safe expression). A {@link Placement} positions an element by an
 * anchor + responsive offset rather than a fixed x/y, and sizes it with Dims,
 * with min/max clamps. Anchors keep elements attached to their edge/centre as
 * the label grows or shrinks, and clamps keep text legible and on-canvas — the
 * "by construction" half of the adaptivity safety net (the other half being the
 * multi-size lint pass).
 *
 * Everything resolves to plain absolute canvas pixels, which is exactly what
 * the existing rasterizer consumes.
 */

import { evalAst, validateAst, type Ast, type Scope, type EvalLimits, DEFAULT_LIMITS } from './safe-expr';

/**
 * A length. Serialisable wire forms:
 *   - `number`                      → absolute canvas px (back-compat with LabelDesign)
 *   - `{ u: 'px' | 'mm', v }`       → absolute
 *   - `{ u: '%', v, of? }`          → percentage of canvas width/height/min/max
 *   - `{ e: Ast }`                  → pre-compiled safe expression → px
 */
export type Dim =
    | number
    | { u: 'px' | 'mm'; v: number }
    | { u: '%'; v: number; of?: 'w' | 'h' | 'min' | 'max' }
    /** Safe expression → px. `src` is the editable source (round-trips in editors). */
    | { e: Ast; src?: string };

export type Anchor = 'tl' | 't' | 'tr' | 'l' | 'c' | 'r' | 'bl' | 'b' | 'br';

/** A resolved element box in canvas px — used as an anchoring reference. */
export interface RefBox { x: number; y: number; w: number; h: number; }

export interface Placement {
    /**
     * Anchor relative to *another element* instead of the canvas: the id of the
     * reference element. The anchor/origin fractions then apply to that
     * element's resolved box, so e.g. "5 mm left of the barcode" is
     * `{ relTo: 'bc', anchor: 'l', origin: 'r', dx: { u:'mm', v:-5 } }`. The
     * resolver orders elements by this dependency and breaks cycles by falling
     * back to the canvas.
     */
    relTo?: string;
    /** Canvas point the element hangs off (default 'tl'). */
    anchor?: Anchor;
    /** The element's own reference point placed at the anchor (default = anchor). */
    origin?: Anchor;
    /** Responsive offset from the anchor, along +x / +y. */
    dx?: Dim;
    dy?: Dim;
    /** Responsive size (element-type dependent: width/height, or square size). */
    w?: Dim;
    h?: Dim;
    size?: Dim;
    /** Lower clamps — keep things legible / on-canvas at small sizes. */
    min?: { size?: number; w?: number; h?: number };
    /** Upper clamps. */
    max?: { size?: number; w?: number; h?: number };
}

export interface DimContext {
    /** Canvas width in px. */
    W: number;
    /** Canvas height in px. */
    H: number;
    /** px per mm for the target printer resolution. */
    pxPerMm: number;
    /** Scope for expression Dims (includes W, H, params, and the mm() helper). */
    scope: Scope;
    limits?: EvalLimits;
}

/** Horizontal fraction (0=left, .5=centre, 1=right) of an anchor. */
export function anchorFx(a: Anchor): number {
    return a === 'l' || a === 'tl' || a === 'bl' ? 0
        : a === 'r' || a === 'tr' || a === 'br' ? 1
        : 0.5;
}

/** Vertical fraction (0=top, .5=middle, 1=bottom) of an anchor. */
export function anchorFy(a: Anchor): number {
    return a === 't' || a === 'tl' || a === 'tr' ? 0
        : a === 'b' || a === 'bl' || a === 'br' ? 1
        : 0.5;
}

export type AnchorH = 'l' | 'c' | 'r';
export type AnchorV = 't' | 'c' | 'b';

/** Split an anchor into its horizontal and vertical halves. */
export function anchorParts(a: Anchor): { h: AnchorH; v: AnchorV } {
    const h: AnchorH = anchorFx(a) === 0 ? 'l' : anchorFx(a) === 1 ? 'r' : 'c';
    const v: AnchorV = anchorFy(a) === 0 ? 't' : anchorFy(a) === 1 ? 'b' : 'c';
    return { h, v };
}

/** Recombine horizontal + vertical halves into an anchor. */
export function makeAnchor(h: AnchorH, v: AnchorV): Anchor {
    if (v === 't') return h === 'l' ? 'tl' : h === 'r' ? 'tr' : 't';
    if (v === 'b') return h === 'l' ? 'bl' : h === 'r' ? 'br' : 'b';
    return h === 'l' ? 'l' : h === 'r' ? 'r' : 'c';
}

/** Resolve a Dim to absolute px. `axis` picks the base for a bare `%`. */
export function resolveDim(dim: Dim, ctx: DimContext, axis: 'w' | 'h' = 'w'): number {
    if (typeof dim === 'number') return dim;
    if ('u' in dim) {
        if (dim.u === '%') {
            const of = dim.of ?? axis;
            const base = of === 'w' ? ctx.W : of === 'h' ? ctx.H : of === 'min' ? Math.min(ctx.W, ctx.H) : Math.max(ctx.W, ctx.H);
            return (dim.v / 100) * base;
        }
        return dim.u === 'mm' ? dim.v * ctx.pxPerMm : dim.v;
    }
    // expression
    try {
        const v = evalAst(dim.e, ctx.scope, ctx.limits ?? DEFAULT_LIMITS);
        return typeof v === 'number' && Number.isFinite(v) ? v : 0;
    } catch {
        return 0;
    }
}

/** Resolve an optional Dim; undefined stays undefined. */
export function resolveDimOpt(dim: Dim | undefined, ctx: DimContext, axis: 'w' | 'h' = 'w'): number | undefined {
    return dim === undefined ? undefined : resolveDim(dim, ctx, axis);
}

function clamp(v: number, lo: number | undefined, hi: number | undefined): number {
    if (lo !== undefined && v < lo) v = lo;
    if (hi !== undefined && v > hi) v = hi;
    return v;
}

export interface ResolvedBox {
    x: number;
    y: number;
    /** Present when the placement specified a size for this axis. */
    w?: number;
    h?: number;
    size?: number;
}

/**
 * Resolve a Placement to an absolute box. The element's *content* bounds
 * (`contentW`/`contentH`) — e.g. measured text — are used when the placement
 * does not pin an explicit size, so anchoring still works for
 * intrinsically-sized elements.
 */
export function resolvePlacement(
    place: Placement,
    ctx: DimContext,
    content: { w: number; h: number },
    ref?: RefBox
): ResolvedBox {
    const size = place.size !== undefined
        ? clamp(resolveDim(place.size, ctx, 'h'), place.min?.size, place.max?.size)
        : undefined;
    const w = place.w !== undefined
        ? clamp(resolveDim(place.w, ctx, 'w'), place.min?.w, place.max?.w)
        : size ?? content.w;
    const h = place.h !== undefined
        ? clamp(resolveDim(place.h, ctx, 'h'), place.min?.h, place.max?.h)
        : size ?? content.h;

    const anchor = place.anchor ?? 'tl';
    const origin = place.origin ?? anchor;
    const dx = place.dx !== undefined ? resolveDim(place.dx, ctx, 'w') : 0;
    const dy = place.dy !== undefined ? resolveDim(place.dy, ctx, 'h') : 0;

    // Anchor to the reference element's box when relTo is set, else the canvas.
    const base: RefBox = ref ?? { x: 0, y: 0, w: ctx.W, h: ctx.H };
    const x = base.x + base.w * anchorFx(anchor) - w * anchorFx(origin) + dx;
    const y = base.y + base.h * anchorFy(anchor) - h * anchorFy(origin) + dy;

    return { x, y, w, h, size };
}

// ---- import-gate validation --------------------------------------------

const ANCHORS = new Set<Anchor>(['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br']);

/** Validate an untrusted Dim (as loaded from JSON). Empty = safe. */
export function validateDim(dim: unknown, limits: EvalLimits = DEFAULT_LIMITS): string[] {
    if (typeof dim === 'number') return Number.isFinite(dim) ? [] : ['Non-finite dimension'];
    if (!dim || typeof dim !== 'object') return ['Malformed dimension'];
    const d = dim as Record<string, unknown>;
    if ('u' in d) {
        if (d.u !== 'px' && d.u !== 'mm' && d.u !== '%') return [`Bad unit "${String(d.u)}"`];
        if (typeof d.v !== 'number' || !Number.isFinite(d.v)) return ['Bad dimension value'];
        if (d.u === '%' && d.of !== undefined && !['w', 'h', 'min', 'max'].includes(d.of as string)) return ['Bad percentage base'];
        return [];
    }
    if ('e' in d) return validateAst(d.e, limits);
    return ['Malformed dimension'];
}

/** Validate an untrusted Placement (as loaded from JSON). Empty = safe. */
export function validatePlacement(place: unknown, limits: EvalLimits = DEFAULT_LIMITS): string[] {
    if (!place || typeof place !== 'object') return ['Malformed placement'];
    const p = place as Record<string, unknown>;
    const errors: string[] = [];
    if (p.relTo !== undefined && (typeof p.relTo !== 'string' || p.relTo.length > 200)) errors.push('Bad relTo reference');
    if (p.anchor !== undefined && !ANCHORS.has(p.anchor as Anchor)) errors.push('Bad anchor');
    if (p.origin !== undefined && !ANCHORS.has(p.origin as Anchor)) errors.push('Bad origin');
    for (const key of ['dx', 'dy', 'w', 'h', 'size'] as const) {
        if (p[key] !== undefined) errors.push(...validateDim(p[key], limits));
    }
    for (const key of ['min', 'max'] as const) {
        const c = p[key];
        if (c !== undefined) {
            if (!c || typeof c !== 'object') { errors.push(`Bad ${key} clamp`); continue; }
            for (const v of Object.values(c as Record<string, unknown>)) {
                if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v))) errors.push(`Bad ${key} clamp value`);
            }
        }
    }
    return errors;
}
