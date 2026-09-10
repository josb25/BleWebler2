/**
 * The label *template* document, and the resolver that compiles it down to a
 * concrete {@link LabelDesign}.
 *
 * A template is the printer-/label-agnostic, parametric superset of a design:
 *
 *   - **params** — typed inputs the user fills in (OpenSCAD-style variables),
 *     also usable in `{bindings}` and expressions.
 *   - **elements** — like design elements, but data fields are compiled
 *     {@link TextBinding}s and geometry is a responsive {@link Placement}.
 *   - **adaptivity** — the authoring size and an optional supported size range.
 *
 * `resolveTemplate` takes a target canvas size + parameter values and produces
 * an ordinary absolute-pixel `LabelDesign`, which the existing rasterizer and
 * printer path consume unchanged. The px-per-mm used for `mm` units is derived
 * from the *target* canvas (heightPx / tapeWidthMm), so a template authored on
 * one printer/label resolves correctly on another — that is what makes it
 * device-agnostic.
 */

import {
    PX_PER_MM, newId, pxToMm, createDesign, createElement,
    type LabelDesign, type AnyElement, type ElementType, type DitherMode,
    type LinearSymbology, type ShapeKind, type SymbolPath, type WebFontId
} from '../model/design';
import type { InkSlot } from 'universal-label-core';
import { measureElement, textLayout, type MeasureTextFn } from '../raster/measure';
import { compileText, resolveText, type TextBinding } from './expr';
import { resolveDim, resolvePlacement, anchorFx, anchorFy, type Dim, type Anchor, type Placement, type DimContext, type RefBox } from './dim';
import {
    solveAxis, constraintsFor, constraintDeps, axisFraction,
    type Constraint, type ConstraintAxis, type SolveIssue
} from './constraints';
import type { Scope } from './safe-expr';

/** Resolve a Dim to a finite, non-negative px length. */
function sizeOf(dim: Dim, ctx: DimContext, axis: 'w' | 'h' = 'h'): number {
    const v = resolveDim(dim, ctx, axis);
    return Number.isFinite(v) ? Math.max(0, v) : 0;
}

// ---- parameters ---------------------------------------------------------

export type ParamType = 'text' | 'number' | 'boolean' | 'select' | 'color' | 'date';

export interface TemplateParam {
    /** Identifier used in bindings/expressions (must be a valid identifier). */
    name: string;
    label: string;
    type: ParamType;
    default: string | number | boolean;
    /** number */
    min?: number;
    max?: number;
    step?: number;
    /** select */
    options?: string[];
    /** text */
    multiline?: boolean;
    help?: string;
}

// ---- elements -----------------------------------------------------------

interface BaseTemplateElement {
    id: string;
    place: Placement;
    /** Interaction-lock flag, carried through so a locked element stays locked. */
    locked?: boolean;
    /** Per-axis interaction locks (see ElementBase.lockX) — also carried through. */
    lockX?: boolean;
    lockY?: boolean;
    /** Rotation in degrees (see model rotationStepFor); carried through. */
    rotation?: number;
    /** Ink slot id (see LabelTemplate.slots); carried through. Omitted = primary. */
    ink?: string;
    /** Per-element 1-bit cutoff (see ElementBase.monoThreshold); carried through. */
    monoThreshold?: number;
}

export interface TemplateTextElement extends BaseTemplateElement {
    type: 'text';
    text: TextBinding;
    font: 'bitmap' | 'vector';
    bitmapFont: string;
    fontFamily: string;
    /** Bundled typeface id — required for vector text in a shared design. */
    webFont?: WebFontId;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    align: 'left' | 'center' | 'right';
    /** Shrink `size` down to `place.min.size` so the text fits its width box. */
    autofit?: boolean;
    /** Wrap onto multiple lines at the resolved `place.w` width box. */
    wrap?: boolean;
    /** Knock the glyphs out of a solid block (white-on-black header style). */
    invert?: boolean;
    invertPad?: number;
    /** Vertical placement of the block inside the `place.h` frame. */
    valign?: 'top' | 'middle' | 'bottom';
}

export interface TemplateBarcodeElement extends BaseTemplateElement {
    type: 'barcode';
    data: TextBinding;
    showText: boolean;
    symbology?: LinearSymbology;
}

export interface TemplateQrElement extends BaseTemplateElement {
    type: 'qr';
    data: TextBinding;
    ecLevel: 'L' | 'M' | 'Q' | 'H';
}

export interface TemplateDataMatrixElement extends BaseTemplateElement {
    type: 'datamatrix';
    data: TextBinding;
}

export interface TemplateShapeElement extends BaseTemplateElement {
    type: 'shape';
    shape: ShapeKind;
    stroke: number;
    fill: boolean;
    /**
     * Corner radius (rect). A Dim rather than a plain number so it can be
     * `{e: corner}` — i.e. track the selected label's own die-cut radius.
     */
    radius?: Dim;
    dash?: number;
}

export interface TemplateSymbolElement extends BaseTemplateElement {
    type: 'symbol';
    /** Bundled symbol key, bindable so a select param can drive it. */
    name: TextBinding;
    /** Custom artwork carried with the template; overrides `name`. */
    path?: SymbolPath;
}

export interface TemplateImageElement extends BaseTemplateElement {
    type: 'image';
    /** Data URL, or a binding that resolves to one (e.g. a param). */
    src: TextBinding;
    mode: DitherMode;
    threshold: number;
    invert: boolean;
}

export type TemplateElement =
    | TemplateTextElement | TemplateBarcodeElement | TemplateQrElement
    | TemplateDataMatrixElement | TemplateImageElement
    | TemplateShapeElement | TemplateSymbolElement;

// ---- document -----------------------------------------------------------

export interface TemplateAdaptivity {
    /**
     * The size the template was authored at — and, when known, the device
     * resolution it was authored on.
     *
     * `dpmm` is what makes "was this drawn for my printer" answerable at all.
     * Millimetres do not carry it: 12 mm of tape is 96 dots on a 203 dpi head
     * and 142 on a 300 dpi one, so a template can match a roll exactly in
     * millimetres and still have been drawn on a canvas half the size. Optional
     * because templates predating the field exist and are not wrong — they are
     * simply silent about it, and a filter must treat silence as unknown rather
     * than as a match.
     */
    designedFor: { tapeWidthMm: number; labelLengthMm?: number; dpmm?: number };
    /**
     * Continuous/gapless media only: feed exactly as much tape as the content
     * needs instead of a fixed label length. The canvas length becomes the
     * content's extent plus {@link autoLengthPadMm} on the trailing edge.
     */
    autoLength?: boolean;
    /** Trailing margin (mm) added past the content when auto-lengthing. */
    autoLengthPadMm?: number;
    /**
     * What relative placements (%, anchors, centring) are measured against:
     *
     *  - `'printable'` (default) — the printable canvas, i.e. what the printhead
     *    can actually mark. Centred content looks centred *in the print*.
     *  - `'media'` — the whole physical label including the unprintable margins
     *    (tape edges, head-to-cutter lead-in). Centred content sits centred on
     *    the *tape*, which is what you want when the label is viewed as an
     *    object rather than as a print area.
     */
    relativeTo?: 'printable' | 'media';
    /** Optional declared supported range; import/preview warn outside it. */
    minTapeWidthMm?: number;
    maxTapeWidthMm?: number;
    minLabelLengthMm?: number;
    maxLabelLengthMm?: number;
}

/**
 * Licences an author can attach to something they share.
 *
 * Deliberately the Creative Commons set the maker communities already use, so
 * a licence chosen here means the same thing it means everywhere else, plus
 * `all-rights-reserved` for "you may print this, but don't redistribute it".
 * There is no house licence and no implicit grant: absence of a licence is
 * *not* permission, which is why sharing requires the author to pick one.
 */
export const TEMPLATE_LICENSES = [
    'CC0-1.0',
    'CC-BY-4.0',
    'CC-BY-SA-4.0',
    'CC-BY-NC-4.0',
    'CC-BY-NC-SA-4.0',
    'CC-BY-ND-4.0',
    'CC-BY-NC-ND-4.0',
    'all-rights-reserved'
] as const;
export type TemplateLicense = (typeof TEMPLATE_LICENSES)[number];

/** Upper bounds on the sharing metadata, enforced by the import gate. */
/**
 * Tag caps.
 *
 * Set high enough that nobody organising their own library will ever meet them
 * — tag a label as freely as you like. They are not a style guide; they are the
 * bound on what an *imported* document can do to you, because a template from a
 * stranger is parsed before anyone has decided to trust it, and a file
 * declaring a million tags would otherwise be a way to fill someone's storage
 * and grind their library screen to a halt.
 */
export const TAG_LIMITS = { maxTags: 1000, maxTagLength: 60 } as const;

/**
 * A photograph of the label in use.
 *
 * Not a {@link PublicationPreview}: those are machine renders of the payload at
 * several sizes, regenerated on every publish, and they answer "does this
 * adapt". This answers "would I want this" — the label stuck on the actual
 * cable, jar or drawer — and no renderer can produce it.
 */
export interface TemplateImage {
    /**
     * A `data:` URL, always. Never a remote address: a template is opened by
     * whoever downloads it, and a URL pointing at someone's server would turn
     * every view into a callback telling them who is looking.
     */
    src: string;
    /** Required — it is both the caption and the alternative text. */
    alt: string;
    credit?: string;
}

export interface TemplateGallery {
    /** The one shown on a library card. */
    cover?: TemplateImage;
    /** Extra photographs for the detail view. */
    shots?: TemplateImage[];
}

/**
 * Bounds on embedded photography.
 *
 * The saved library is a single localStorage key with a few megabytes to its
 * name for *everything*, so an untouched phone photo or two would fill it and
 * every save after that would fail. Images are downscaled and re-encoded before
 * they get here — which also drops the EXIF, and with it the GPS coordinates of
 * wherever the photo was taken.
 */
export const IMAGE_LIMITS = { maxShots: 3, maxBytes: 220 * 1024, maxAlt: 200 } as const;

export interface LabelTemplate {
    /** Format version. The first public ULT format is version 1. */
    version: 1;
    kind: 'label-template';
    id: string;
    name: string;
    author?: string;
    description?: string;
    /**
     * The terms the author shares this under. Optional in the format because a
     * design on your own machine needs no licence — it becomes required only
     * at the point of publishing, where {@link validatePublication} enforces it.
     */
    license?: TemplateLicense;
    /** Free-form topic tags for browsing. Normalised and capped on import. */
    tags?: string[];
    /**
     * Monotonic content revision, bumped by the author when they republish.
     * Distinct from {@link version}, which describes the *format*. Lets a
     * published design keep every earlier revision retrievable, so a link to
     * something someone downloaded never rots.
     */
    revision?: number;
    params: TemplateParam[];
    elements: TemplateElement[];
    /**
     * Optional anchor-to-anchor distance constraints. Where present they
     * override an element's own placement on that axis — see ./constraints.
     */
    constraints?: Constraint[];
    adaptivity: TemplateAdaptivity;
    /**
     * Ink slots this template's elements refer to, beyond the implicit primary.
     *
     * Part of the shared document rather than working state: an element saying
     * `ink: 'accent'` is meaningless to whoever opens the file unless the slot's
     * name, intended colour and fallback travel with it. What the slot is
     * *bound* to is the opposite — that depends on the roll in the machine and
     * stays out of the template entirely.
     */
    slots?: InkSlot[];
    /**
     * Photographs of the finished label in use.
     *
     * Editorial, author-supplied, and never regenerated — the opposite of the
     * rendered previews the publisher produces. See {@link TemplateGallery}.
     */
    gallery?: TemplateGallery;
    /** Final 1-bit threshold, mirrors LabelDesign.threshold. */
    threshold: number;
}

/** Scale only geometry whose unit is explicitly pixels. */
function scalePixelDim(dim: Dim | undefined, factor: number): Dim | undefined {
    if (dim === undefined) return undefined;
    if (typeof dim === 'number') return dim * factor;
    if ('u' in dim && dim.u === 'px') return { ...dim, v: dim.v * factor };
    return dim;
}

function scalePixelPlacement(place: Placement, factor: number): Placement {
    const scaleClamp = (clamp: Placement['min']): Placement['min'] => clamp && ({
        ...(clamp.size !== undefined ? { size: clamp.size * factor } : {}),
        ...(clamp.w !== undefined ? { w: clamp.w * factor } : {}),
        ...(clamp.h !== undefined ? { h: clamp.h * factor } : {})
    });
    return {
        ...place,
        dx: scalePixelDim(place.dx, factor),
        dy: scalePixelDim(place.dy, factor),
        w: scalePixelDim(place.w, factor),
        h: scalePixelDim(place.h, factor),
        size: scalePixelDim(place.size, factor),
        min: scaleClamp(place.min),
        max: scaleClamp(place.max)
    };
}

/**
 * Retarget an authored template from one dot density to another.
 *
 * Millimetre, percentage and expression dimensions already resolve against the
 * target canvas. Only literal pixel geometry needs scaling. Keeping this in the
 * renderer prevents printer- or manufacturer-specific conversion rules from
 * leaking into the application UI.
 */
export function scaleTemplatePixelGeometry(tpl: LabelTemplate, factor: number): LabelTemplate {
    if (!Number.isFinite(factor) || factor <= 0 || Math.abs(factor - 1) < 1e-9) return tpl;
    const elements = tpl.elements.map((element): TemplateElement => {
        const place = scalePixelPlacement(element.place, factor);
        switch (element.type) {
            case 'text':
                return {
                    ...element,
                    place,
                    invertPad: element.invertPad === undefined ? undefined : element.invertPad * factor
                };
            case 'shape':
                return {
                    ...element,
                    place,
                    stroke: element.stroke * factor,
                    dash: element.dash === undefined ? undefined : element.dash * factor,
                    radius: scalePixelDim(element.radius, factor)
                };
            default:
                return { ...element, place };
        }
    });
    return {
        ...tpl,
        elements,
        constraints: tpl.constraints?.map(constraint => ({
            ...constraint,
            distance: scalePixelDim(constraint.distance, factor)!
        }))
    };
}

// ---- resolution ---------------------------------------------------------

export interface ResolveIssue {
    elementId: string;
    code: 'overflow' | 'clipped' | 'empty' | 'error';
    severity: 'error' | 'warn';
    message: string;
}

export interface ResolveOptions {
    widthPx: number;
    heightPx: number;
    /** Physical tape width (canvas height) in mm — drives mm unit conversion. */
    tapeWidthMm?: number;
    /**
     * Pixels per millimetre of the target canvas. When given it wins over the
     * `heightPx / tapeWidthMm` estimate, which is only right while the canvas
     * spans the whole tape — not when a narrow printhead clamps it.
     */
    dpmm?: number;
    labelLengthMm?: number;
    /** Parameter values (name → value); missing params fall back to defaults. */
    params?: Record<string, unknown>;
    /** Canvas-bound text measurer for accurate vector width / auto-fit. */
    measureText?: MeasureTextFn;
    /**
     * Unprintable margins around the printable canvas, in px. Only used when the
     * template sets `adaptivity.relativeTo: 'media'` — placements are then
     * resolved against the full media box and translated back into printable
     * canvas coordinates (so content may legitimately sit partly off-canvas).
     */
    mediaInsets?: { x?: number; y?: number };
    /**
     * Corner radius of the physical label in mm (from the paper profile).
     * Exposed to expressions as `corner` (px) / `cornerMm`, so artwork can be
     * inset from a rounded die-cut, or a frame can match the sticker's own
     * corners instead of guessing at them.
     */
    cornerRadiusMm?: number;
    /** Final threshold override (else template.threshold). */
    threshold?: number;
}

export interface ResolveResult {
    design: LabelDesign;
    issues: ResolveIssue[];
}

/** Build the expression/binding scope for a resolution. */
export function buildScope(tpl: LabelTemplate, opts: ResolveOptions, pxPerMm: number): Scope {
    const params: Record<string, unknown> = {};
    for (const p of tpl.params) params[p.name] = p.default;
    if (opts.params) for (const [k, v] of Object.entries(opts.params)) if (v !== undefined) params[k] = v;
    return {
        ...params,
        W: opts.widthPx,
        H: opts.heightPx,
        mm: pxPerMm,
        px: 1,
        // Also expose the raw size in mm for convenience.
        Wmm: opts.widthPx / pxPerMm,
        Hmm: opts.heightPx / pxPerMm,
        // The label's own corner radius — 0 on square/continuous media.
        corner: (opts.cornerRadiusMm ?? 0) * pxPerMm,
        cornerMm: opts.cornerRadiusMm ?? 0
    };
}

const DEFAULT_MIN_TEXT_PX = 6;

/**
 * Compile a template + parameter values into an absolute-pixel LabelDesign for
 * the given target canvas. Also returns per-element issues (overflow/clipping),
 * which the lint pass aggregates across sizes.
 */
export function resolveTemplate(tpl: LabelTemplate, opts: ResolveOptions): ResolveResult {
    const pxPerMm = opts.dpmm && opts.dpmm > 0
        ? opts.dpmm
        : opts.tapeWidthMm && opts.tapeWidthMm > 0 ? opts.heightPx / opts.tapeWidthMm : PX_PER_MM;

    // When the template positions against the whole physical label, lay it out in
    // the larger media box and shift the result back into printable-canvas
    // coordinates. Everything downstream then works in canvas space as usual.
    const useMedia = tpl.adaptivity.relativeTo === 'media';
    const insetX = useMedia ? Math.max(0, Math.round(opts.mediaInsets?.x ?? 0)) : 0;
    const insetY = useMedia ? Math.max(0, Math.round(opts.mediaInsets?.y ?? 0)) : 0;

    const W = opts.widthPx + insetX;
    const H = opts.heightPx + insetY * 2;
    const scope = buildScope(tpl, { ...opts, widthPx: W, heightPx: H }, pxPerMm);
    const ctx: DimContext = { W, H, pxPerMm, scope };

    const elements: AnyElement[] = new Array(tpl.elements.length);
    const issues: ResolveIssue[] = [];
    // Elements may anchor to one another (place.relTo); resolve in dependency
    // order so a reference box is available, and keep the original array index
    // (z-order) in the output.
    const boxes = new Map<string, RefBox>();
    for (const i of resolutionOrder(tpl)) {
        const te = tpl.elements[i];
        const ref = te.place.relTo ? boxes.get(te.place.relTo) : undefined;
        const built = resolveElement(te, ctx, opts.measureText, ref);
        if (te.locked) built.element.locked = true;
        if (te.lockX) built.element.lockX = true;
        if (te.lockY) built.element.lockY = true;
        if (te.rotation) built.element.rotation = te.rotation;
        if (te.ink) built.element.ink = te.ink;
        if (te.monoThreshold !== undefined) built.element.monoThreshold = te.monoThreshold;
        // Media-relative layout happens in the larger box; bring it back to the
        // printable canvas origin. (relTo boxes stay in the same space.)
        if (insetX || insetY) {
            built.element.x -= insetX;
            built.element.y -= insetY;
        }
        // Constraints (if any) override this element's own placement.
        applyConstraints(tpl, te, built, ctx, boxes, opts.measureText, issues);

        elements[i] = built.element;
        const { x, y } = built.element;
        const w = built.box.w ?? built.contentW;
        const h = built.box.h ?? built.contentH;
        boxes.set(te.id, { x, y, w, h });
        // Overflow / off-canvas check for the adaptivity safety net. A rotated
        // element is measured by its rotated bounding box (about its centre).
        const eps = 0.5;
        let ax = x, ay = y, aw = w, ah = h;
        if (te.rotation) {
            const rad = (te.rotation * Math.PI) / 180;
            const c = Math.abs(Math.cos(rad)), s = Math.abs(Math.sin(rad));
            aw = w * c + h * s;
            ah = w * s + h * c;
            ax = x + w / 2 - aw / 2;
            ay = y + h / 2 - ah / 2;
        }
        // Checked against the *printable* canvas: anything outside it won't be
        // marked by the printhead, even if it sits within the physical media.
        if (ax < -eps || ay < -eps || ax + aw > opts.widthPx + eps || ay + ah > opts.heightPx + eps) {
            issues.push({
                elementId: te.id, code: 'overflow', severity: 'error',
                message: `Element extends outside the ${Math.round(pxToMm(opts.widthPx))}×${Math.round(pxToMm(opts.heightPx))}mm printable area`
            });
        }
        if (built.empty) {
            issues.push({ elementId: te.id, code: 'empty', severity: 'warn', message: 'Resolves to empty content' });
        }
    }

    const design: LabelDesign = {
        version: 1,
        id: newId(),
        name: tpl.name,
        // The canvas is always the printable area, whichever box was laid out in.
        heightPx: opts.heightPx,
        widthPx: opts.widthPx,
        threshold: opts.threshold ?? tpl.threshold,
        elements,
        // Slot declarations pass straight through: they are what makes an
        // element's `ink: 'accent'` mean anything once the design reaches the
        // planner, and they belong to the document rather than to this layout.
        slots: tpl.slots
    };
    return { design, issues };
}

interface BuiltElement {
    element: AnyElement;
    box: { w?: number; h?: number };
    contentW: number;
    contentH: number;
    empty: boolean;
}

/**
 * The right-most pixel any element occupies — the content extent used to size
 * auto-length (continuous) labels. Rotated elements are measured by their
 * rotated bounding box, matching the overflow check.
 */
export function contentExtentPx(design: LabelDesign, measureText?: MeasureTextFn): number {
    let right = 0;
    for (const el of design.elements) {
        const b = measureElement(el, measureText);
        let x = el.x, w = b.width, h = b.height;
        if (el.rotation) {
            const rad = (el.rotation * Math.PI) / 180;
            const c = Math.abs(Math.cos(rad)), s = Math.abs(Math.sin(rad));
            const aw = w * c + h * s;
            x = el.x + w / 2 - aw / 2;
            w = aw;
        }
        right = Math.max(right, x + w);
    }
    return Math.ceil(right);
}

/** Order element indices so an element's relTo reference resolves first (cycle-safe). */
function resolutionOrder(tpl: LabelTemplate): number[] {
    const n = tpl.elements.length;
    const idToIndex = new Map(tpl.elements.map((e, i) => [e.id, i]));
    const state = new Array<number>(n).fill(0); // 0=unvisited, 1=visiting, 2=done
    const order: number[] = [];
    const visit = (i: number): void => {
        if (state[i] !== 0) return; // done, or a back-edge (cycle) — stop
        state[i] = 1;
        // An element resolves after anything it references: its relTo box, and
        // any element its constraints measure against.
        const el = tpl.elements[i];
        const deps = [el.place.relTo, ...constraintDeps(tpl.constraints, el.id)];
        for (const ref of deps) {
            const dep = ref !== undefined ? idToIndex.get(ref) : undefined;
            if (dep !== undefined && dep !== i) visit(dep);
        }
        state[i] = 2;
        order.push(i);
    };
    for (let i = 0; i < n; i++) visit(i);
    return order;
}

/** Give an element a solved span on one axis, where that is meaningful. */
function applySpan(el: AnyElement, axis: ConstraintAxis, span: number): boolean {
    const v = Math.max(1, Math.round(span));
    if (el.type === 'barcode' || el.type === 'image' || el.type === 'shape') {
        if (axis === 'x') el.width = v; else el.height = v;
        return true;
    }
    // Square by construction: a solved span on either axis sets the edge.
    if (el.type === 'qr' || el.type === 'datamatrix' || el.type === 'symbol') { el.size = v; return true; }
    // Text only has a meaningful horizontal span when it wraps; a glyph run's
    // height follows the font, so a solved span is ignored there.
    if (el.type === 'text' && axis === 'x' && el.wrap) { el.width = v; return true; }
    return false;
}

/**
 * Solve and apply this element's constraints. Runs after ordinary placement, so
 * a constrained axis simply overrides what the placement produced, and an
 * unconstrained axis is left untouched.
 */
function applyConstraints(
    tpl: LabelTemplate,
    te: TemplateElement,
    built: BuiltElement,
    ctx: DimContext,
    boxes: Map<string, RefBox>,
    measureText: MeasureTextFn | undefined,
    issues: ResolveIssue[]
): void {
    const { x: xs, y: ys } = constraintsFor(tpl.constraints, te.id);
    if (xs.length === 0 && ys.length === 0) return;

    /** Where a constraint's target point sits, in canvas px, plus its distance. */
    const targetOf = (c: Constraint): number | undefined => {
        const base: RefBox | undefined = c.to.element
            ? boxes.get(c.to.element)
            : { x: 0, y: 0, w: ctx.W, h: ctx.H };
        if (!base) return undefined;
        const f = axisFraction(c.to.point, c.axis);
        const anchorPos = c.axis === 'x' ? base.x + base.w * f : base.y + base.h * f;
        return anchorPos + resolveDim(c.distance, ctx, c.axis === 'x' ? 'w' : 'h');
    };

    const solveIssues: SolveIssue[] = [];
    let w = built.box.w ?? built.contentW;
    let h = built.box.h ?? built.contentH;
    const sx = solveAxis(xs, w, targetOf, solveIssues);
    const sy = solveAxis(ys, h, targetOf, solveIssues);

    // Apply solved spans first, then re-measure so dependents see the true box.
    let resized = false;
    if (sx.span !== undefined) resized = applySpan(built.element, 'x', sx.span) || resized;
    if (sy.span !== undefined) resized = applySpan(built.element, 'y', sy.span) || resized;
    if (resized) {
        const m = measureElement(built.element, measureText);
        w = m.width; h = m.height;
        built.contentW = w; built.contentH = h;
        if (built.box.w !== undefined) built.box.w = w;
        if (built.box.h !== undefined) built.box.h = h;
    }

    if (sx.pos !== undefined) built.element.x = Math.round(sx.pos);
    if (sy.pos !== undefined) built.element.y = Math.round(sy.pos);

    for (const si of solveIssues) {
        issues.push({
            elementId: te.id,
            code: 'error',
            severity: si.code === 'over-constrained' ? 'warn' : 'error',
            message: si.message
        });
    }
}

function resolveElement(te: TemplateElement, ctx: DimContext, measureText?: MeasureTextFn, ref?: RefBox): BuiltElement {
    switch (te.type) {
        case 'text': {
            const text = resolveText(te.text, ctx.scope);
            let size = te.place.size !== undefined
                ? clampMin(sizeOf(te.place.size, ctx), te.place.min?.size ?? DEFAULT_MIN_TEXT_PX, te.place.max?.size)
                : DEFAULT_MIN_TEXT_PX * 2;
            // The text frame. Each side is optional; a declared side is the
            // element's box (and the wrap column, when wrapping).
            const boxW = te.place.w !== undefined ? sizeOf(te.place.w, ctx, 'w') : undefined;
            const boxH = te.place.h !== undefined ? sizeOf(te.place.h, ctx, 'h') : undefined;
            let probe = makeText(te, text, Math.round(size), boxW, boxH);
            let content = measureElement(probe, measureText);
            if (te.autofit) {
                // Shrink until the *ink* fits whichever sides were declared;
                // fall back to the canvas for an undeclared one.
                const minSize = te.place.min?.size ?? DEFAULT_MIN_TEXT_PX;
                const tooBig = (): boolean => {
                    const t = textLayout(probe, measureText);
                    return t.inkW > (boxW ?? ctx.W) || t.inkH > (boxH ?? ctx.H);
                };
                let guard = 0;
                while (tooBig() && size > minSize && guard++ < 200) {
                    size = Math.max(minSize, size - 1);
                    probe = makeText(te, text, Math.round(size), boxW, boxH);
                    content = measureElement(probe, measureText);
                }
            }
            // Position by the resolved bounds — `size` is the glyph height, not
            // a box width, so strip it here (it is already applied to `probe`).
            const box = resolvePlacement({ ...te.place, size: undefined }, ctx, { w: content.width, h: content.height }, ref);
            return {
                element: { ...probe, x: Math.round(box.x), y: Math.round(box.y) },
                box: {}, contentW: content.width, contentH: content.height, empty: text.length === 0
            };
        }
        case 'barcode': {
            const data = resolveText(te.data, ctx.scope);
            const width = te.place.w !== undefined ? sizeOf(te.place.w, ctx, 'w') : ctx.W * 0.6;
            const height = te.place.h !== undefined ? sizeOf(te.place.h, ctx, 'h') : ctx.H * 0.5;
            const el: AnyElement = {
                type: 'barcode', id: te.id, x: 0, y: 0,
                width: Math.round(width), height: Math.round(height),
                data, showText: te.showText, symbology: te.symbology
            };
            const content = measureElement(el);
            const box = resolvePlacement(te.place, ctx, { w: content.width, h: content.height }, ref);
            return {
                element: { ...el, x: Math.round(box.x), y: Math.round(box.y) },
                box: { w: content.width, h: content.height }, contentW: content.width, contentH: content.height,
                empty: data.length === 0
            };
        }
        case 'qr': {
            const data = resolveText(te.data, ctx.scope);
            const size = te.place.size !== undefined ? sizeOf(te.place.size, ctx, 'h') : Math.min(ctx.W, ctx.H);
            const el: AnyElement = { type: 'qr', id: te.id, x: 0, y: 0, size: Math.round(size), data, ecLevel: te.ecLevel };
            const content = measureElement(el);
            // Position by the actual (module-snapped) QR bounds, not the target size.
            const box = resolvePlacement({ ...te.place, size: undefined }, ctx, { w: content.width, h: content.height }, ref);
            return {
                element: { ...el, x: Math.round(box.x), y: Math.round(box.y) },
                box: { w: content.width, h: content.height }, contentW: content.width, contentH: content.height,
                empty: data.length === 0
            };
        }
        case 'datamatrix': {
            const data = resolveText(te.data, ctx.scope);
            const size = te.place.size !== undefined ? sizeOf(te.place.size, ctx, 'h') : Math.min(ctx.W, ctx.H);
            const el: AnyElement = { type: 'datamatrix', id: te.id, x: 0, y: 0, size: Math.round(size), data };
            const content = measureElement(el);
            // Position by the module-snapped bounds, as with QR.
            const box = resolvePlacement({ ...te.place, size: undefined }, ctx, { w: content.width, h: content.height }, ref);
            return {
                element: { ...el, x: Math.round(box.x), y: Math.round(box.y) },
                box: { w: content.width, h: content.height }, contentW: content.width, contentH: content.height,
                empty: data.length === 0
            };
        }
        case 'shape': {
            // Shapes are pure geometry, so their box *is* their size — which is
            // what makes them the cleanest thing for a constraint to stretch.
            const width = te.place.w !== undefined ? sizeOf(te.place.w, ctx, 'w') : ctx.W / 4;
            const height = te.place.h !== undefined ? sizeOf(te.place.h, ctx, 'h') : ctx.H / 4;
            const box = resolvePlacement(te.place, ctx, { w: width, h: height }, ref);
            const el: AnyElement = {
                type: 'shape', id: te.id, x: Math.round(box.x), y: Math.round(box.y),
                shape: te.shape,
                width: Math.max(1, Math.round(box.w ?? width)),
                height: Math.max(1, Math.round(box.h ?? height)),
                stroke: te.stroke, fill: te.fill, dash: te.dash,
                radius: te.radius !== undefined ? Math.round(sizeOf(te.radius, ctx, 'h')) : undefined
            };
            return { element: el, box: { w: el.width, h: el.height }, contentW: el.width, contentH: el.height, empty: false };
        }
        case 'symbol': {
            const name = resolveText(te.name, ctx.scope);
            const size = te.place.size !== undefined ? sizeOf(te.place.size, ctx, 'h') : ctx.H / 2;
            const box = resolvePlacement(te.place, ctx, { w: size, h: size }, ref);
            const el: AnyElement = {
                type: 'symbol', id: te.id, x: Math.round(box.x), y: Math.round(box.y),
                size: Math.max(1, Math.round(size)), name, path: te.path
            };
            return { element: el, box: { w: el.size, h: el.size }, contentW: el.size, contentH: el.size, empty: false };
        }
        case 'image': {
            const src = resolveText(te.src, ctx.scope);
            const width = te.place.w !== undefined ? sizeOf(te.place.w, ctx, 'w') : ctx.H;
            const height = te.place.h !== undefined ? sizeOf(te.place.h, ctx, 'h') : ctx.H;
            const box = resolvePlacement(te.place, ctx, { w: width, h: height }, ref);
            const el: AnyElement = {
                type: 'image', id: te.id, x: Math.round(box.x), y: Math.round(box.y),
                width: Math.round(box.w ?? width), height: Math.round(box.h ?? height),
                src, mode: te.mode, threshold: te.threshold, invert: te.invert
            };
            return { element: el, box: { w: el.width, h: el.height }, contentW: el.width, contentH: el.height, empty: !src };
        }
    }
}

function makeText(te: TemplateTextElement, text: string, size: number, boxW?: number, boxH?: number): Extract<AnyElement, { type: 'text' }> {
    return {
        type: 'text', id: te.id, x: 0, y: 0, size,
        text, font: te.font, bitmapFont: te.bitmapFont, fontFamily: te.fontFamily, webFont: te.webFont,
        bold: te.bold, italic: te.italic, underline: te.underline, align: te.align,
        // The resolved place.w/h are the text frame (and w the wrap column).
        wrap: te.wrap || undefined,
        width: boxW !== undefined ? Math.round(boxW) : undefined,
        height: boxH !== undefined ? Math.round(boxH) : undefined,
        valign: te.valign,
        invert: te.invert || undefined,
        invertPad: te.invertPad
    };
}

function clampMin(v: number, lo: number, hi?: number): number {
    if (v < lo) v = lo;
    if (hi !== undefined && v > hi) v = hi;
    return v;
}

// ---- constructors -------------------------------------------------------

export function createTemplate(name = 'Untitled template', tapeWidthMm = 12, labelLengthMm = 40): LabelTemplate {
    return {
        version: 1, kind: 'label-template', id: newId(), name,
        params: [], elements: [],
        adaptivity: { designedFor: { tapeWidthMm, labelLengthMm } },
        threshold: 128
    };
}

/** A fresh blank template for a new (plain) label of the given canvas size. */
export function blankTemplate(name = 'Untitled label', tapeWidthMm = 12, labelLengthMm = 40): LabelTemplate {
    return createTemplate(name, tapeWidthMm, labelLengthMm);
}

/**
 * A new template element of the given type with an absolute-`px` placement —
 * the default for elements added in the editor (a plain, non-parametric label
 * is just a template whose elements are all placed in px).
 */
export function createTemplateElement(type: ElementType, widthPx: number, heightPx: number): TemplateElement {
    const stub = createDesign(heightPx, widthPx);
    return absoluteElementFromDesign(createElement(type, stub));
}

export interface FromDesignOptions {
    name?: string;
    /**
     * When true, produce a genuinely *adaptive* template: each element gets a
     * smart anchor (which third of the canvas it sits in), a millimetre offset
     * from that anchor, and relative (% / mm) sizing, and text auto-fits. When
     * false (default), the template is a faithful 1:1 px snapshot — the honest
     * starting point the author then relaxes by hand.
     */
    adaptive?: boolean;
}

/**
 * Seed a template from an existing absolute-pixel design. See
 * {@link FromDesignOptions.adaptive} for the two modes.
 */
export function templateFromDesign(design: LabelDesign, opts: FromDesignOptions = {}): LabelTemplate {
    const name = opts.name ?? design.name;
    const tapeWidthMm = design.paper?.tapeWidthMm ?? round1(pxToMm(design.heightPx));
    const labelLengthMm = design.paper?.labelLengthMm ?? round1(pxToMm(design.widthPx));
    const pxPerMm = tapeWidthMm > 0 ? design.heightPx / tapeWidthMm : PX_PER_MM;
    const build = opts.adaptive
        ? (el: AnyElement) => adaptiveElementFromDesign(el, design.widthPx, design.heightPx, pxPerMm)
        : absoluteElementFromDesign;
    const elements = design.elements.map(el => {
        const te = build(el);
        if (el.locked) te.locked = true; // freeze state is carried into the template
        if (el.lockX) te.lockX = true;
        if (el.lockY) te.lockY = true;
        if (el.rotation) te.rotation = el.rotation;
        if (el.ink) te.ink = el.ink;
        if (el.monoThreshold !== undefined) te.monoThreshold = el.monoThreshold;
        return te;
    });
    return {
        version: 1, kind: 'label-template', id: newId(), name,
        params: [], elements,
        adaptivity: { designedFor: { tapeWidthMm, labelLengthMm } },
        slots: design.slots,
        threshold: design.threshold
    };
}

function px(v: number): Dim { return { u: 'px', v }; }

// ---- 1:1 absolute snapshot ----

function absoluteElementFromDesign(el: AnyElement): TemplateElement {
    const place: Placement = { anchor: 'tl', origin: 'tl', dx: px(el.x), dy: px(el.y) };
    switch (el.type) {
        case 'text':
            return {
                type: 'text', id: el.id,
                place: {
                    ...place, size: px(el.size),
                    ...(el.width !== undefined ? { w: px(el.width) } : {}),
                    ...(el.height !== undefined ? { h: px(el.height) } : {})
                },
                text: compileText(el.text), font: el.font, bitmapFont: el.bitmapFont, fontFamily: el.fontFamily, webFont: el.webFont,
                bold: el.bold, italic: el.italic, underline: el.underline, align: el.align,
                wrap: el.wrap || undefined, valign: el.valign,
                invert: el.invert || undefined, invertPad: el.invertPad
            };
        case 'barcode':
            return {
                type: 'barcode', id: el.id, place: { ...place, w: px(el.width), h: px(el.height) },
                data: compileText(el.data), showText: el.showText, symbology: el.symbology
            };
        case 'qr':
            return { type: 'qr', id: el.id, place: { ...place, size: px(el.size) }, data: compileText(el.data), ecLevel: el.ecLevel };
        case 'datamatrix':
            return { type: 'datamatrix', id: el.id, place: { ...place, size: px(el.size) }, data: compileText(el.data) };
        case 'shape':
            return {
                type: 'shape', id: el.id, place: { ...place, w: px(el.width), h: px(el.height) },
                shape: el.shape, stroke: el.stroke, fill: el.fill, dash: el.dash,
                radius: el.radius !== undefined ? px(el.radius) : undefined
            };
        case 'symbol':
            return {
                type: 'symbol', id: el.id, place: { ...place, size: px(el.size) },
                name: compileText(el.name), path: el.path
            };
        case 'image':
            return {
                type: 'image', id: el.id, place: { ...place, w: px(el.width), h: px(el.height) },
                src: el.src, mode: el.mode, threshold: el.threshold, invert: el.invert
            };
    }
}

// ---- adaptive conversion ----

function pctH(pxVal: number, H: number): Dim { return { u: '%', v: round1((pxVal / H) * 100), of: 'h' }; }
function pctW(pxVal: number, W: number): Dim { return { u: '%', v: round1((pxVal / W) * 100), of: 'w' }; }
function mm(pxVal: number, pxPerMm: number): Dim { return { u: 'mm', v: round1(pxVal / pxPerMm) }; }

/** Anchor for the third of the canvas an element's centre falls in. */
function anchorFor(cx: number, cy: number, W: number, H: number): Anchor {
    const h = cx < W / 3 ? 'l' : cx > (2 * W) / 3 ? 'r' : 'c';
    const v = cy < H / 3 ? 't' : cy > (2 * H) / 3 ? 'b' : 'c';
    if (v === 'c' && h === 'c') return 'c';
    if (v === 'c') return h as Anchor;            // 'l' | 'r'
    if (h === 'c') return v as Anchor;            // 't' | 'b'
    return (v + h) as Anchor;                     // 'tl' | 'tr' | 'bl' | 'br'
}

function adaptiveElementFromDesign(el: AnyElement, W: number, H: number, pxPerMm: number): TemplateElement {
    const b = measureElement(el);
    const w = b.width, h = b.height;
    const anchor = anchorFor(el.x + w / 2, el.y + h / 2, W, H);
    // Invert resolvePlacement: dx = x - W*fx(anchor) + w*fx(origin); origin = anchor.
    const dxPx = el.x - W * anchorFx(anchor) + w * anchorFx(anchor);
    const dyPx = el.y - H * anchorFy(anchor) + h * anchorFy(anchor);
    const base: Placement = { anchor, origin: anchor, dx: mm(dxPx, pxPerMm), dy: mm(dyPx, pxPerMm) };
    switch (el.type) {
        case 'text':
            return {
                type: 'text', id: el.id,
                place: {
                    ...base, size: pctH(el.size, H), min: { size: 6 },
                    ...(el.width !== undefined ? { w: pctW(el.width, W) } : {}),
                    ...(el.height !== undefined ? { h: pctH(el.height, H) } : {})
                },
                text: compileText(el.text), font: el.font, bitmapFont: el.bitmapFont, fontFamily: el.fontFamily, webFont: el.webFont,
                bold: el.bold, italic: el.italic, underline: el.underline, align: el.align,
                autofit: true, wrap: el.wrap || undefined, valign: el.valign,
                invert: el.invert || undefined, invertPad: el.invertPad
            };
        case 'barcode':
            return {
                type: 'barcode', id: el.id, place: { ...base, w: pctW(el.width, W), h: pctH(el.height, H) },
                data: compileText(el.data), showText: el.showText, symbology: el.symbology
            };
        case 'qr':
            return { type: 'qr', id: el.id, place: { ...base, size: pctH(el.size, H) }, data: compileText(el.data), ecLevel: el.ecLevel };
        case 'datamatrix':
            return { type: 'datamatrix', id: el.id, place: { ...base, size: pctH(el.size, H) }, data: compileText(el.data) };
        case 'shape':
            return {
                type: 'shape', id: el.id, place: { ...base, w: pctW(el.width, W), h: pctH(el.height, H) },
                shape: el.shape,
                // Stroke and radius stay absolute: a hairline should stay a
                // hairline on a wider tape, not scale into a slab.
                stroke: el.stroke, fill: el.fill, dash: el.dash,
                radius: el.radius !== undefined ? px(el.radius) : undefined
            };
        case 'symbol':
            return {
                type: 'symbol', id: el.id, place: { ...base, size: pctH(el.size, H), min: { size: 8 } },
                name: compileText(el.name), path: el.path
            };
        case 'image':
            return {
                type: 'image', id: el.id, place: { ...base, w: pctW(el.width, W), h: pctH(el.height, H) },
                src: el.src, mode: el.mode, threshold: el.threshold, invert: el.invert
            };
    }
}

function round1(v: number): number { return Math.round(v * 10) / 10; }

// Re-export for consumers that build placements/dims.
export type { ElementType };
