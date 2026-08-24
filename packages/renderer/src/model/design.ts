/**
 * The label design document model.
 *
 * Deliberately framework-free plain data: every mutation helper returns a new
 * object (structural sharing), so the model works with any reactivity system,
 * serializes 1:1 to JSON for persistence, and diffs cheaply for undo history.
 *
 * COORDINATE SYSTEM (matches universal-label-core):
 *   - heightPx is fixed to the printer's printhead resolution (canvasHeightPx)
 *   - widthPx is the variable tape length
 *   - element x/y are top-left offsets in canvas pixels
 */

export type DitherMode = 'threshold' | 'bayer' | 'floyd-steinberg';

/**
 * Linear barcode symbologies. Declared here rather than in the encoder because
 * it is document data — the raster layer imports it, not the other way round.
 */
export type LinearSymbology = 'code128' | 'code39' | 'ean13' | 'ean8' | 'upca' | 'itf';

/**
 * Ids of the bundled vector typefaces. Same arrangement as the symbologies
 * above: the identifiers are document data and live here, while the catalogue
 * that knows each font's family, weights and licence lives in
 * raster/fonts/webfonts.ts and imports this.
 */
export const WEB_FONT_IDS = [
    'inter', 'archivo-narrow', 'archivo-black', 'noto-sans', 'ibm-plex-mono', 'lora'
] as const;
export type WebFontId = (typeof WEB_FONT_IDS)[number];

export const LINEAR_SYMBOLOGIES: readonly LinearSymbology[] = [
    'code128', 'code39', 'ean13', 'ean8', 'upca', 'itf'
];

/** Fields shared by every element. */
export interface ElementBase {
    id: string;
    x: number;
    y: number;
    /**
     * When true the element is frozen on the canvas: it can't be moved, resized,
     * or deleted by pointer/keyboard (it can still be selected so it can be
     * unlocked). Purely an editor-interaction flag — ignored by the rasterizer,
     * and carried through templates so a locked element stays locked when saved.
     */
    locked?: boolean;
    /**
     * Per-axis interaction locks. A locked axis is frozen against pointer and
     * keyboard edits (drag, resize, nudge) on that coordinate alone, so an
     * element can be free to slide horizontally while its vertical placement
     * stays put. Like {@link locked} this is an editor flag only: layout rules
     * and template adaptivity still resolve the axis normally.
     */
    lockX?: boolean;
    lockY?: boolean;
    /**
     * Which ink *slot* this element prints in — a design-side id, never a
     * colorant.
     *
     * Omitted means the primary slot, which is why every existing design keeps
     * printing exactly as before. The slot is resolved against the loaded media
     * at raster time, so the same design prints black on one roll and red on
     * another without being edited.
     */
    ink?: string;
    /**
     * This element's own 1-bit cutoff, overriding {@link LabelDesign.threshold}.
     *
     * The document-wide threshold is a single compromise across everything on
     * the label, and one number rarely suits both a pale photograph and a line
     * of fine text: lift it until the photo has detail and the text goes heavy,
     * drop it for the text and the photo washes out. Setting it per element
     * settles that locally.
     *
     * Absent means "use the document's" — which is what every existing element
     * does, so nothing changes for a label that never touches this.
     *
     * Distinct from {@link ImageElement.threshold}, which feeds the *dither*
     * (what grey becomes a dot); this is the final black-or-white decision.
     */
    monoThreshold?: number;
    /**
     * Rotation in degrees clockwise about the element's centre (default 0).
     * The permitted granularity depends on the content — see
     * {@link rotationStepFor}: bitmap text / barcode / QR only look right at
     * 90° steps (they'd resample to fuzz otherwise), whereas system-font text
     * and images can rotate to any angle.
     */
    rotation?: number;
}

export interface TextElement extends ElementBase {
    type: 'text';
    /** Target glyph height in px; bitmap fonts snap to an integer scale of their cell height. */
    size: number;
    text: string;
    /**
     * Wrap the text onto multiple lines at {@link width} instead of running on a
     * single line. Explicit `\n` in the text always breaks a line either way.
     */
    wrap?: boolean;
    /**
     * The text *frame*. Either side may be left out, in which case that
     * dimension hugs the glyphs (the historic behaviour). When set, the frame —
     * not the ink — is the element's box: the text is positioned inside it by
     * {@link align} and {@link valign}, `wrap` breaks at `width`, and `autofit`
     * shrinks to fit. Setting it also makes the selection outline, constraints
     * and overflow checks agree, since they all measure the same rectangle.
     */
    width?: number;
    height?: number;
    /** Where the text block sits vertically in the frame (default top). */
    valign?: 'top' | 'middle' | 'bottom';
    /** 'bitmap' renders a pixel font (always crisp at 1-bit); 'vector' uses an outline font. */
    font: 'bitmap' | 'vector';
    /** Bitmap-font id from the font registry (used when font === 'bitmap'). */
    bitmapFont: string;
    /**
     * CSS family for vector text, resolved against the *local* machine.
     * Convenient for your own labels and unreliable for anyone else's, which is
     * why {@link webFont} exists and wins where both are set.
     */
    fontFamily: string;
    /**
     * A typeface from the bundled catalogue (see raster/fonts/webfonts).
     * Reproduces identically on every machine because the file travels with the
     * app, so it is what a shared design must use — enforced at publish time,
     * never while you are working locally.
     */
    webFont?: WebFontId;
    /** Style flags — apply to both vector and bitmap text (bitmap uses faux styling). */
    bold: boolean;
    italic: boolean;
    underline: boolean;
    align: 'left' | 'center' | 'right';
    /**
     * Knock the glyphs out of a solid block instead of printing them directly —
     * the white-on-black treatment used for label headers. The block covers the
     * text bounds plus {@link invertPad}.
     */
    invert?: boolean;
    /** Padding in px around the glyphs when `invert` is on (default 4). */
    invertPad?: number;
}

export interface BarcodeElement extends ElementBase {
    type: 'barcode';
    /** Target width in px; bars snap to an integer module width <= this. */
    width: number;
    /** Bar height in px (human-readable line, when enabled, adds to the bounds). */
    height: number;
    data: string;
    /** Render the data as bitmap-font text under the bars. */
    showText: boolean;
    /** Linear symbology; omitted means Code 128. */
    symbology?: LinearSymbology;
}

export interface QrElement extends ElementBase {
    type: 'qr';
    /** Edge length in px; modules snap to an integer pixel size <= this. */
    size: number;
    data: string;
    ecLevel: 'L' | 'M' | 'Q' | 'H';
}

/**
 * Data Matrix is a separate type rather than a barcode symbology because it is
 * two-dimensional: it sizes by a single edge like {@link QrElement}, so
 * constraints and the span solver treat it the same way.
 */
export interface DataMatrixElement extends ElementBase {
    type: 'datamatrix';
    /** Edge length in px; modules snap to an integer pixel size <= this. */
    size: number;
    data: string;
}

export type ShapeKind = 'line' | 'rect' | 'ellipse';

export interface ShapeElement extends ElementBase {
    type: 'shape';
    shape: ShapeKind;
    width: number;
    height: number;
    /** Outline thickness in px. */
    stroke: number;
    /** Fill the interior solid (rect/ellipse). Lines ignore it. */
    fill: boolean;
    /** Corner radius in px — rect only. */
    radius?: number;
    /**
     * Dash length in px (gap is the same); 0 or omitted draws solid. Lines only —
     * a dashed fold line is the common use.
     */
    dash?: number;
}

/**
 * Vector artwork: either a bundled symbol by name, or the user's own, imported
 * from an SVG and reduced to plain path geometry. Both are the same data — a
 * `d` string in a viewBox — so there is one renderer and no privileged set.
 */
export interface SymbolElement extends ElementBase {
    type: 'symbol';
    /** Bundled registry key. Ignored when `path` is set. */
    name: string;
    /** Edge length in px of the box the artwork is fitted into. */
    size: number;
    /** Custom artwork, sanitised at import; overrides `name`. */
    path?: SymbolPath;
}

export interface SymbolPath {
    /** Absolute SVG path data — geometry only, no document, no references. */
    d: string;
    /** [minX, minY, width, height] the path is drawn in. */
    viewBox: [number, number, number, number];
    fillRule?: 'nonzero' | 'evenodd';
    /** Shown in the editor so a custom icon is identifiable. */
    label?: string;
}

export interface ImageElement extends ElementBase {
    type: 'image';
    width: number;
    height: number;
    /** Data URL. Kept self-contained so designs persist/export without loose files. */
    src: string;
    /** How this image is reduced to 1-bit. */
    mode: DitherMode;
    /** 0..255 luminance cutoff for 'threshold' and bias for 'bayer'. */
    threshold: number;
    invert: boolean;
}

export type AnyElement =
    | TextElement | BarcodeElement | QrElement | DataMatrixElement
    | ImageElement | ShapeElement | SymbolElement;
export type ElementType = AnyElement['type'];

import type { InkBinding, InkSlot, PaperProfile } from 'universal-label-core';

export interface LabelDesign {
    version: 1;
    id: string;
    name: string;
    heightPx: number;
    widthPx: number;
    /**
     * 0..255 luminance cutoff of the final 1-bit pass over the whole canvas.
     * This is what makes anti-aliased vector text printable; bitmap
     * font/barcode/QR pixels are pure black and unaffected by it.
     */
    threshold: number;
    elements: AnyElement[];
    /** The paper/media profile this design was created for (optional) */
    paper?: PaperProfile;
    /**
     * The ink slots this design uses, beyond the implicit primary.
     *
     * Declared here rather than inferred from the elements so a slot keeps its
     * name, its intended colour and its fallback policy even while nothing is
     * assigned to it — otherwise renaming the last element off a slot would
     * silently destroy the author's setup.
     */
    slots?: InkSlot[];
    /**
     * How this design's slots map onto the colorants of specific media.
     *
     * One entry per paper the design has been bound against, so moving between
     * rolls and back does not lose the mapping. Absent entries auto-bind.
     */
    inkBindings?: InkBinding[];
}

export const DPI = 203;
export const PX_PER_MM = DPI / 25.4; // ~7.99

/**
 * Default bitmap-font selection for new text: a *family* key (the raster
 * registry resolves it to the crispest concrete master + scale for the target
 * size). Kept as a plain string so the model stays free of any dependency on
 * the raster layer's glyph data.
 */
export const DEFAULT_BITMAP_FONT = 'fixed';

/**
 * The rotation granularity (degrees) an element may snap to. Content that is
 * rasterised as hard 1-bit pixels — bitmap fonts, barcodes, QR — only stays
 * crisp at right angles, so it snaps to 90°. Anti-aliased content (system-font
 * text) and images may rotate freely (1°).
 */
export function rotationStepFor(el: AnyElement): number {
    if (el.type === 'image') return 1;
    if (el.type === 'text') return el.font === 'vector' ? 1 : 90;
    // Shapes and symbols are geometry, not sampled pixels, so they redraw
    // cleanly at any angle rather than resampling to fuzz.
    if (el.type === 'shape' || el.type === 'symbol') return 1;
    return 90; // barcode, qr, datamatrix
}

/**
 * Which geometry fields an element type sizes itself by: a single `size` for
 * the square/scalar kinds, `w`+`h` for the rectangular ones. Exhaustive on
 * purpose — a new element type is a compile error here rather than a size
 * field in the editor that silently writes nothing.
 */
export function sizeFieldsFor(type: ElementType): readonly ('size' | 'w' | 'h')[] {
    switch (type) {
        case 'text':
        case 'qr':
        case 'datamatrix':
        case 'symbol':
            return ['size'];
        case 'barcode':
        case 'image':
        case 'shape':
            return ['w', 'h'];
    }
}

/** True if the element may rotate to any angle (vs. 90° steps). */
export function rotatesFreely(el: AnyElement): boolean {
    return rotationStepFor(el) === 1;
}

/** Normalise + snap a rotation for an element to its permitted granularity. */
export function snapRotation(el: AnyElement, deg: number): number {
    const step = rotationStepFor(el);
    const norm = ((Math.round(deg / step) * step) % 360 + 360) % 360;
    return norm;
}

export function mmToPx(mm: number): number {
    return Math.round(mm * PX_PER_MM);
}

export function pxToMm(px: number): number {
    return px / PX_PER_MM;
}

export function newId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createDesign(heightPx: number, widthPx: number, name = 'Untitled label'): LabelDesign {
    return { version: 1, id: newId(), name, heightPx, widthPx, threshold: 128, elements: [] };
}

const ELEMENT_DEFAULTS = {
    text(design: LabelDesign): TextElement {
        const size = Math.max(8, Math.min(32, Math.round(design.heightPx / 3 / 8) * 8));
        return {
            type: 'text', id: newId(), x: 8, y: 8,
            size, text: 'Text', font: 'bitmap', bitmapFont: DEFAULT_BITMAP_FONT,
            fontFamily: 'sans-serif', bold: false, italic: false, underline: false, align: 'left'
        };
    },
    barcode(design: LabelDesign): BarcodeElement {
        return {
            type: 'barcode', id: newId(), x: 8, y: 8,
            width: Math.round(design.widthPx * 0.6),
            height: Math.max(24, Math.round(design.heightPx * 0.5)),
            data: '123456', showText: true
        };
    },
    qr(design: LabelDesign): QrElement {
        const size = Math.max(48, design.heightPx - 16);
        return { type: 'qr', id: newId(), x: 8, y: 8, size, data: 'https://example.com', ecLevel: 'M' };
    },
    datamatrix(design: LabelDesign): DataMatrixElement {
        const size = Math.max(40, design.heightPx - 16);
        return { type: 'datamatrix', id: newId(), x: 8, y: 8, size, data: 'SN-000123' };
    },
    shape(design: LabelDesign): ShapeElement {
        return {
            type: 'shape', id: newId(), x: 8, y: 8, shape: 'rect',
            width: Math.round(design.widthPx * 0.4),
            height: Math.max(16, Math.round(design.heightPx * 0.4)),
            stroke: 2, fill: false
        };
    },
    symbol(design: LabelDesign): SymbolElement {
        const size = Math.max(24, design.heightPx - 16);
        return { type: 'symbol', id: newId(), x: 8, y: 8, size, name: 'warning' };
    },
    image(design: LabelDesign): ImageElement {
        const size = Math.max(32, design.heightPx - 16);
        return {
            type: 'image', id: newId(), x: 8, y: 8,
            width: size, height: size, src: '',
            mode: 'floyd-steinberg', threshold: 128, invert: false
        };
    }
} as const;

export function createElement(type: ElementType, design: LabelDesign): AnyElement {
    return ELEMENT_DEFAULTS[type](design);
}

// ---- immutable document operations ----

export function addElement(design: LabelDesign, element: AnyElement): LabelDesign {
    return { ...design, elements: [...design.elements, element] };
}

export function removeElement(design: LabelDesign, id: string): LabelDesign {
    return { ...design, elements: design.elements.filter(e => e.id !== id) };
}

export function updateElement(design: LabelDesign, id: string, patch: Partial<AnyElement>): LabelDesign {
    return {
        ...design,
        elements: design.elements.map(e => (e.id === id ? ({ ...e, ...patch } as AnyElement) : e))
    };
}

/** Move an element one step or to the end of the z-order (array order = back-to-front). */
export function reorderElement(design: LabelDesign, id: string, dir: 'forward' | 'backward' | 'front' | 'back'): LabelDesign {
    const idx = design.elements.findIndex(e => e.id === id);
    if (idx < 0) return design;
    const elements = [...design.elements];
    const [el] = elements.splice(idx, 1);
    const target =
        dir === 'front' ? elements.length :
        dir === 'back' ? 0 :
        dir === 'forward' ? Math.min(elements.length, idx + 1) :
        Math.max(0, idx - 1);
    elements.splice(target, 0, el);
    return { ...design, elements };
}

export function getElement(design: LabelDesign, id: string | null): AnyElement | undefined {
    return id === null ? undefined : design.elements.find(e => e.id === id);
}

/** Type guard used when persisting/loading designs from storage. */
export function isLabelDesign(value: unknown): value is LabelDesign {
    if (typeof value !== 'object' || value === null) return false;
    const v = value as Record<string, unknown>;
    return v.version === 1
        && typeof v.id === 'string'
        && typeof v.name === 'string'
        && typeof v.heightPx === 'number'
        && typeof v.widthPx === 'number'
        && typeof v.threshold === 'number'
        && Array.isArray(v.elements);
}
