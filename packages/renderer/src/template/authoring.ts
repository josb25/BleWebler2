/**
 * The bridge between the WYSIWYG editor and a {@link LabelTemplate}.
 *
 * When authoring, the editor keeps editing an ordinary absolute-pixel
 * `LabelDesign` (so the canvas, drag, and every existing tool keep working),
 * plus a small **authoring intent** per element: which anchor it hangs off and,
 * for each offset/size, whether it is expressed in px / mm / % / an expression,
 * with clamps, auto-fit, and an optional parameter binding.
 *
 * `buildTemplate()` *materialises* that intent into a real template: it takes
 * each element's live pixel geometry and re-expresses it in the chosen units,
 * so the designed size renders identically while other sizes reflow.
 * `templateToEditable()` is the inverse, so a saved template can be reopened and
 * refined. Because pixels stay the source of truth, changing a unit or anchor
 * never moves anything on screen — it only changes how the value is stored.
 */

import {
    pxToMm, PX_PER_MM,
    type LabelDesign, type AnyElement
} from '../model/design';
import { measureElement, type MeasureTextFn } from '../raster/measure';
import { anchorFx, anchorFy, type Anchor, type Dim, type Placement, type RefBox } from './dim';
import { parseExpr, unparse, isValidExpr, type Ast } from './safe-expr';
import { compileText, textBindingSource, type TextBinding } from './expr';
import {
    resolveTemplate,
    type LabelTemplate, type TemplateElement, type TemplateParam, type TemplateAdaptivity,
    type TemplateLicense
} from './template';

export type DimUnit = 'px' | 'mm' | '%' | 'expr';
export type PctBase = 'w' | 'h' | 'min' | 'max';

/** How one length is expressed by the author. */
export interface DimChoice {
    unit: DimUnit;
    of?: PctBase;   // when unit === '%'
    expr?: string;  // when unit === 'expr' (source string, round-trips via unparse)
}

/** Per-element responsive intent (keyed by element id in {@link TemplateMeta}). */
export interface ElementAuthoring {
    /** Anchor relative to another element (its id) instead of the canvas. */
    relTo?: string;
    anchor: Anchor;
    origin: Anchor;
    dx: DimChoice;
    dy: DimChoice;
    /** text / qr use `size`; barcode / image use `w` and `h`. */
    size?: DimChoice;
    w?: DimChoice;
    h?: DimChoice;
    min?: { size?: number; w?: number; h?: number };
    max?: { size?: number; w?: number; h?: number };
    autofit?: boolean;
    /** Parameter name the element's content field is bound to (else literal). */
    bind?: string;
}

/** The editor's template-authoring state, alongside the live design. */
export interface TemplateMeta {
    id: string;
    name: string;
    description?: string;
    author?: string;
    /** Sharing metadata, carried through so a round-trip can't drop it. */
    license?: TemplateLicense;
    tags?: string[];
    revision?: number;
    params: TemplateParam[];
    adaptivity: TemplateAdaptivity;
    authoring: Record<string, ElementAuthoring>;
}

/** The content field bound-to a parameter, per element type. */
export function contentFieldOf(type: AnyElement['type']): 'text' | 'data' | 'src' {
    return type === 'text' ? 'text' : type === 'image' ? 'src' : 'data';
}

function pxPerMmFor(design: LabelDesign): number {
    const mm = design.paper?.tapeWidthMm;
    return mm && mm > 0 ? design.heightPx / mm : PX_PER_MM;
}

function round1(v: number): number { return Math.round(v * 10) / 10; }

// ---- defaults -----------------------------------------------------------

/** Anchor for the third of the canvas an element's centre falls in. */
export function anchorForBounds(x: number, y: number, w: number, h: number, W: number, H: number): Anchor {
    const cx = x + w / 2, cy = y + h / 2;
    const hh = cx < W / 3 ? 'l' : cx > (2 * W) / 3 ? 'r' : 'c';
    const vv = cy < H / 3 ? 't' : cy > (2 * H) / 3 ? 'b' : 'c';
    if (vv === 'c' && hh === 'c') return 'c';
    if (vv === 'c') return hh as Anchor;
    if (hh === 'c') return vv as Anchor;
    return (vv + hh) as Anchor;
}

/** The adaptive default intent for a fresh element (mm offsets, % sizes, autofit text). */
export function defaultAuthoringFor(el: AnyElement, W: number, H: number, measure?: MeasureTextFn): ElementAuthoring {
    const b = measureElement(el, measure);
    const anchor = anchorForBounds(el.x, el.y, b.width, b.height, W, H);
    const base: ElementAuthoring = {
        anchor, origin: anchor,
        dx: { unit: 'mm' }, dy: { unit: 'mm' }
    };
    if (el.type === 'text') { base.size = { unit: '%', of: 'h' }; base.min = { size: 6 }; base.autofit = true; }
    else if (el.type === 'qr') { base.size = { unit: '%', of: 'h' }; }
    else { base.w = { unit: '%', of: 'w' }; base.h = { unit: '%', of: 'h' }; }
    return base;
}

// ---- design + intent -> template ---------------------------------------

function materializeDim(px: number, choice: DimChoice | undefined, W: number, H: number, pxPerMm: number, defaultOf: PctBase): Dim {
    const c = choice ?? { unit: 'px' as DimUnit };
    if (c.unit === 'expr') {
        const src = (c.expr ?? '').trim();
        if (src && isValidExpr(src)) return { e: parseExpr(src), src };
        return { u: 'px', v: Math.round(px) }; // invalid/empty expr → freeze current px
    }
    if (c.unit === 'mm') return { u: 'mm', v: round1(px / pxPerMm) };
    if (c.unit === '%') {
        const of = c.of ?? defaultOf;
        const bse = of === 'w' ? W : of === 'h' ? H : of === 'min' ? Math.min(W, H) : Math.max(W, H);
        return { u: '%', v: bse > 0 ? round1((px / bse) * 100) : 0, of };
    }
    return { u: 'px', v: Math.round(px) };
}

/** Offset-from-anchor px (inverse of resolvePlacement), against a base box. */
function offsetPx(pos: number, span: number, baseStart: number, baseSpan: number, anchorFrac: number, originFrac: number): number {
    // resolvePlacement: pos = baseStart + baseSpan*anchorFrac - span*originFrac + d
    return pos - (baseStart + baseSpan * anchorFrac) + span * originFrac;
}

/**
 * The one bindable string an element carries. Shapes have none, so they get an
 * empty string rather than a special case at every call site.
 */
export function contentLiteral(el: AnyElement): string {
    switch (el.type) {
        case 'text': return el.text;
        case 'image': return el.src;
        case 'symbol': return el.name;
        case 'shape': return '';
        default: return el.data;
    }
}

/** The bindable field of a *template* element (mirror of contentLiteral). */
function templateContent(te: TemplateElement): TextBinding {
    switch (te.type) {
        case 'text': return te.text;
        case 'image': return te.src;
        case 'symbol': return te.name;
        case 'shape': return '';
        default: return te.data;
    }
}

function materializeContent(el: AnyElement, a: ElementAuthoring): TextBinding {
    if (a.bind) return compileText(`{${a.bind}}`);
    return compileText(contentLiteral(el));
}

function cleanClamp(c: { size?: number; w?: number; h?: number } | undefined): { size?: number; w?: number; h?: number } | undefined {
    if (!c) return undefined;
    const out: { size?: number; w?: number; h?: number } = {};
    if (typeof c.size === 'number') out.size = c.size;
    if (typeof c.w === 'number') out.w = c.w;
    if (typeof c.h === 'number') out.h = c.h;
    return Object.keys(out).length ? out : undefined;
}

/** Materialise one design element + its intent into a template element. */
export function buildTemplateElement(el: AnyElement, a: ElementAuthoring, W: number, H: number, pxPerMm: number, measure?: MeasureTextFn, ref?: RefBox): TemplateElement {
    const b = measureElement(el, measure);
    const fx = anchorFx(a.anchor), fy = anchorFy(a.anchor);
    const ofx = anchorFx(a.origin), ofy = anchorFy(a.origin);
    // Offset is measured from the anchor point on the base box (a reference
    // element when relTo is set, otherwise the canvas).
    const base: RefBox = ref ?? { x: 0, y: 0, w: W, h: H };
    const dxPx = offsetPx(el.x, b.width, base.x, base.w, fx, ofx);
    const dyPx = offsetPx(el.y, b.height, base.y, base.h, fy, ofy);

    const place: Placement = {
        anchor: a.anchor, origin: a.origin,
        dx: materializeDim(dxPx, a.dx, W, H, pxPerMm, 'w'),
        dy: materializeDim(dyPx, a.dy, W, H, pxPerMm, 'h')
    };
    if (a.relTo && ref) place.relTo = a.relTo;
    const min = cleanClamp(a.min);
    const max = cleanClamp(a.max);
    if (min) place.min = min;
    if (max) place.max = max;

    const locked = el.locked || undefined;
    const lockX = el.lockX || undefined;
    const lockY = el.lockY || undefined;
    const content = materializeContent(el, a);

    switch (el.type) {
        case 'text':
            place.size = materializeDim(el.size, a.size, W, H, pxPerMm, 'h');
            // Carry the text frame, whichever sides the author declared.
            if (el.width !== undefined) place.w = materializeDim(el.width, a.w, W, H, pxPerMm, 'w');
            if (el.height !== undefined) place.h = materializeDim(el.height, a.h, W, H, pxPerMm, 'h');
            return {
                type: 'text', id: el.id, place, locked, lockX, lockY, text: content,
                font: el.font, bitmapFont: el.bitmapFont, fontFamily: el.fontFamily, webFont: el.webFont,
                bold: el.bold, italic: el.italic, underline: el.underline, align: el.align,
                autofit: a.autofit || undefined, wrap: el.wrap || undefined, valign: el.valign,
                invert: el.invert || undefined, invertPad: el.invertPad
            };
        case 'qr':
            place.size = materializeDim(el.size, a.size, W, H, pxPerMm, 'h');
            return { type: 'qr', id: el.id, place, locked, lockX, lockY, data: content, ecLevel: el.ecLevel };
        case 'datamatrix':
            place.size = materializeDim(el.size, a.size, W, H, pxPerMm, 'h');
            return { type: 'datamatrix', id: el.id, place, locked, lockX, lockY, data: content };
        case 'symbol':
            place.size = materializeDim(el.size, a.size, W, H, pxPerMm, 'h');
            return { type: 'symbol', id: el.id, place, locked, lockX, lockY, name: content, path: el.path };
        case 'barcode':
            place.w = materializeDim(el.width, a.w, W, H, pxPerMm, 'w');
            place.h = materializeDim(el.height, a.h, W, H, pxPerMm, 'h');
            return { type: 'barcode', id: el.id, place, locked, lockX, lockY, data: content, showText: el.showText, symbology: el.symbology };
        case 'shape':
            place.w = materializeDim(el.width, a.w, W, H, pxPerMm, 'w');
            place.h = materializeDim(el.height, a.h, W, H, pxPerMm, 'h');
            return {
                type: 'shape', id: el.id, place, locked, lockX, lockY,
                shape: el.shape, stroke: el.stroke, fill: el.fill, radius: el.radius, dash: el.dash
            };
        case 'image':
            place.w = materializeDim(el.width, a.w, W, H, pxPerMm, 'w');
            place.h = materializeDim(el.height, a.h, W, H, pxPerMm, 'h');
            return {
                type: 'image', id: el.id, place, locked, lockX, lockY, src: content,
                mode: el.mode, threshold: el.threshold, invert: el.invert
            };
    }
}

/** Materialise the whole design + meta into a shareable template. */
export function buildTemplate(design: LabelDesign, meta: TemplateMeta, measure?: MeasureTextFn): LabelTemplate {
    const W = design.widthPx, H = design.heightPx;
    const pxPerMm = pxPerMmFor(design);
    const byId = new Map(design.elements.map(e => [e.id, e]));
    const refBoxOf = (id: string | undefined): RefBox | undefined => {
        if (!id) return undefined;
        const r = byId.get(id);
        if (!r) return undefined;
        const rb = measureElement(r, measure);
        return { x: r.x, y: r.y, w: rb.width, h: rb.height };
    };
    const elements = design.elements.map(el => {
        const a = meta.authoring[el.id] ?? defaultAuthoringFor(el, W, H, measure);
        const te = buildTemplateElement(el, a, W, H, pxPerMm, measure, refBoxOf(a.relTo));
        if (el.rotation) te.rotation = el.rotation;
        return te;
    });
    return {
        version: 1, kind: 'label-template',
        id: meta.id, name: meta.name || design.name,
        author: meta.author, description: meta.description,
        license: meta.license, tags: meta.tags, revision: meta.revision,
        params: meta.params, elements,
        adaptivity: meta.adaptivity,
        threshold: design.threshold
    };
}

// ---- px -> placement (the drag/resize inverse) -------------------------

/** Re-express a target pixel length in a dim's *current* unit (expr stays as-is). */
export function reexpressDim(current: Dim | undefined, targetPx: number, W: number, H: number, pxPerMm: number, defaultOf: PctBase): Dim {
    if (current && typeof current === 'object' && 'e' in current) return current; // expression is authoritative
    if (current && typeof current === 'object' && 'u' in current) {
        if (current.u === 'mm') return { u: 'mm', v: round1(targetPx / pxPerMm) };
        if (current.u === '%') {
            const of = current.of ?? defaultOf;
            const base = of === 'w' ? W : of === 'h' ? H : of === 'min' ? Math.min(W, H) : Math.max(W, H);
            return { u: '%', v: base ? round1((targetPx / base) * 100) : 0, of };
        }
        return { u: 'px', v: Math.round(targetPx) };
    }
    return { u: 'px', v: Math.round(targetPx) };
}

export interface PlaceCtx { W: number; H: number; pxPerMm: number; bounds: { w: number; h: number }; refBox?: RefBox; }

/** Update a placement so it resolves to the given pixel geometry, preserving units. */
export function placeAtPx(place: Placement, target: { x?: number; y?: number; w?: number; h?: number; size?: number }, ctx: PlaceCtx): Placement {
    const next: Placement = { ...place };
    const base = ctx.refBox ?? { x: 0, y: 0, w: ctx.W, h: ctx.H };
    const anchor = place.anchor ?? 'tl';
    const origin = place.origin ?? anchor;
    const fx = anchorFx(anchor), fy = anchorFy(anchor), ofx = anchorFx(origin), ofy = anchorFy(origin);
    if (target.x !== undefined) {
        const dxPx = target.x - (base.x + base.w * fx) + ctx.bounds.w * ofx;
        next.dx = reexpressDim(place.dx, dxPx, ctx.W, ctx.H, ctx.pxPerMm, 'w');
    }
    if (target.y !== undefined) {
        const dyPx = target.y - (base.y + base.h * fy) + ctx.bounds.h * ofy;
        next.dy = reexpressDim(place.dy, dyPx, ctx.W, ctx.H, ctx.pxPerMm, 'h');
    }
    if (target.size !== undefined) next.size = reexpressDim(place.size, target.size, ctx.W, ctx.H, ctx.pxPerMm, 'h');
    if (target.w !== undefined) next.w = reexpressDim(place.w, target.w, ctx.W, ctx.H, ctx.pxPerMm, 'w');
    if (target.h !== undefined) next.h = reexpressDim(place.h, target.h, ctx.W, ctx.H, ctx.pxPerMm, 'h');
    return next;
}

/** Derive the responsive-intent view (units/anchor/clamps/bind) from a template element's placement. */
export function authoringViewOf(te: TemplateElement, params: TemplateParam[]): ElementAuthoring {
    const anchor = te.place.anchor ?? 'tl';
    const a: ElementAuthoring = {
        relTo: te.place.relTo,
        anchor, origin: te.place.origin ?? anchor,
        dx: unitOfDim(te.place.dx), dy: unitOfDim(te.place.dy),
        min: cleanClamp(te.place.min), max: cleanClamp(te.place.max)
    };
    a.bind = detectBind(templateContent(te), params);
    if (te.type === 'text') { a.size = unitOfDim(te.place.size); a.autofit = te.autofit; }
    else if (te.type === 'qr' || te.type === 'datamatrix' || te.type === 'symbol') { a.size = unitOfDim(te.place.size); }
    else { a.w = unitOfDim(te.place.w); a.h = unitOfDim(te.place.h); }
    return a;
}

// ---- template -> design + intent ---------------------------------------

function unitOfDim(dim: Dim | undefined): DimChoice {
    if (dim === undefined) return { unit: 'px' };
    if (typeof dim === 'number') return { unit: 'px' };
    if ('u' in dim) {
        if (dim.u === '%') return { unit: '%', of: dim.of ?? 'w' };
        return { unit: dim.u === 'mm' ? 'mm' : 'px' };
    }
    return { unit: 'expr', expr: dim.src ?? unparse(dim.e) };
}

/** If a binding is exactly one bare-identifier expression naming a param, return it. */
function detectBind(binding: TextBinding, params: TemplateParam[]): string | undefined {
    if (typeof binding === 'string') return undefined;
    if (binding.parts.length !== 1) return undefined;
    const part = binding.parts[0];
    if (typeof part === 'string') return undefined;
    const ast: Ast = part.e;
    if (ast.t === 'ident' && params.some(p => p.name === ast.name)) return ast.name;
    return undefined;
}

/** Reconstruct the editable design + authoring intent from a saved template. */
export function templateToEditable(tpl: LabelTemplate, measure?: MeasureTextFn): { design: LabelDesign; meta: TemplateMeta } {
    const df = tpl.adaptivity.designedFor;
    const heightPx = Math.max(8, Math.round(df.tapeWidthMm * PX_PER_MM));
    const widthPx = Math.max(8, Math.round((df.labelLengthMm ?? 40) * PX_PER_MM));
    const { design } = resolveTemplate(tpl, {
        widthPx, heightPx, tapeWidthMm: df.tapeWidthMm, labelLengthMm: df.labelLengthMm, measureText: measure
    });

    const authoring: Record<string, ElementAuthoring> = {};
    for (const te of tpl.elements) {
        const anchor = te.place.anchor ?? 'tl';
        const a: ElementAuthoring = {
            relTo: te.place.relTo,
            anchor, origin: te.place.origin ?? anchor,
            dx: unitOfDim(te.place.dx), dy: unitOfDim(te.place.dy),
            min: cleanClamp(te.place.min), max: cleanClamp(te.place.max)
        };
        a.bind = detectBind(templateContent(te), tpl.params);
        if (te.type === 'text') { a.size = unitOfDim(te.place.size); a.autofit = te.autofit; }
        else if (te.type === 'qr' || te.type === 'datamatrix' || te.type === 'symbol') { a.size = unitOfDim(te.place.size); }
        else { a.w = unitOfDim(te.place.w); a.h = unitOfDim(te.place.h); }
        authoring[te.id] = a;
    }

    return {
        design: { ...design, name: tpl.name },
        meta: {
            id: tpl.id, name: tpl.name, description: tpl.description, author: tpl.author,
            license: tpl.license, tags: tpl.tags ? [...tpl.tags] : undefined, revision: tpl.revision,
            params: tpl.params.map(p => ({ ...p })), adaptivity: tpl.adaptivity, authoring
        }
    };
}

/** Editable source string for an element's bound/literal content (for the panel). */
export function contentSource(el: AnyElement): string {
    return textBindingSource(compileText(contentLiteral(el)));
}
