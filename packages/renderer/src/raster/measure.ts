/**
 * Shared element layout math — used identically by the interactive editor
 * (selection bounds, hit testing) and the rasterizer (drawing), so what you
 * select is exactly what prints.
 */
import type { AnyElement, BarcodeElement, DataMatrixElement, QrElement, TextElement } from '../model/design';
import { encodeLinear, type LinearSymbol } from './linear';
import { encodeQr } from './qr';
import { encodeDataMatrix } from './datamatrix';
import { measureBitmapText, italicShearPx, boldExtraPx } from './bitmapfont';
import { getFontMeta, resolveBitmapFont, DEFAULT_FONT_ID } from './fonts/registry';
import { webFontFamily } from './fonts/webfonts';

/** Quiet zone on each side of a Code 128 symbol, in modules (spec minimum). */
export const BARCODE_QUIET_MODULES = 10;

export interface ElementBounds {
    width: number;
    height: number;
    /** Set when the element data cannot be encoded (bad barcode chars, QR overflow). */
    error?: string;
}

/**
 * The CSS font shorthand a vector text element measures and draws with.
 *
 * A catalogue font wins over `fontFamily`: it is bundled, so it resolves to the
 * same outlines on every machine, which is the whole point of it existing.
 * `fontFamily` remains the local-only path for your own labels.
 */
export function vectorFontString(el: TextElement): string {
    const family = el.webFont !== undefined ? webFontFamily(el.webFont) : el.fontFamily;
    return `${el.italic ? 'italic ' : ''}${el.bold ? 'bold ' : ''}${el.size}px ${family}`;
}

export function vectorLineHeight(el: TextElement): number {
    return Math.round(el.size * 1.2);
}

export type MeasureTextFn = (text: string, font: string) => number;

/**
 * Greedy word wrap. Returns the laid-out lines for `text` within `maxWidthPx`,
 * measured by `widthOf`. Explicit `\n` always starts a new line; a single word
 * that cannot fit is hard-broken so text never silently overflows.
 */
export function wrapText(text: string, maxWidthPx: number, widthOf: (s: string) => number): string[] {
    if (!(maxWidthPx > 0)) return text.split('\n');
    const out: string[] = [];

    /** Split one over-long word into chunks that each fit. */
    const hardBreak = (word: string): string[] => {
        const chunks: string[] = [];
        let chunk = '';
        for (const ch of word) {
            const next = chunk + ch;
            if (chunk && widthOf(next) > maxWidthPx) {
                chunks.push(chunk);
                chunk = ch;
            } else {
                chunk = next;
            }
        }
        if (chunk) chunks.push(chunk);
        return chunks;
    };

    for (const paragraph of text.split('\n')) {
        if (paragraph === '') { out.push(''); continue; }
        let line = '';
        for (const word of paragraph.split(' ')) {
            const candidate = line === '' ? word : `${line} ${word}`;
            if (widthOf(candidate) <= maxWidthPx) { line = candidate; continue; }
            if (line !== '') { out.push(line); line = ''; }
            // The word alone may still be too wide — break it up.
            if (widthOf(word) <= maxWidthPx) { line = word; continue; }
            const chunks = hardBreak(word);
            out.push(...chunks.slice(0, -1));
            line = chunks[chunks.length - 1] ?? '';
        }
        out.push(line);
    }
    return out;
}

/**
 * The lines a text element actually renders as — the single place wrapping is
 * decided, so measurement (selection bounds, layout) and rasterization (what
 * prints) can never disagree.
 */
export function textLines(el: TextElement, measureText?: MeasureTextFn): string[] {
    if (!el.wrap || !el.width || el.width <= 0) return el.text.split('\n');
    if (el.font === 'bitmap') {
        // Monospace: width is exactly chars × cell width, no glyph data needed.
        const { meta, scale } = resolveBitmapFont(el.bitmapFont, el.size);
        const cell = meta.w * scale;
        return wrapText(el.text, el.width, s => s.length * cell);
    }
    const font = vectorFontString(el);
    return wrapText(el.text, el.width, s => (measureText ? measureText(s, font) : s.length * el.size * 0.6));
}

export interface BarcodeLayout {
    modules: boolean[];
    moduleW: number;
    /** Full drawn width including quiet zones. */
    barsWidth: number;
    barHeight: number;
    textScale: number;
    /** Height of the human-readable line incl. gap (0 when disabled). */
    textBlockH: number;
    /** Quiet zone each side, in modules (symbology-dependent). */
    quiet: number;
    /** Text under the bars — may carry a check digit the user didn't type. */
    hri: string;
    /** Module ranges drawn at full height while data bars are shortened. */
    guards: LinearSymbol['guards'];
}

export function barcodeLayout(el: BarcodeElement): BarcodeLayout {
    const sym = encodeLinear(el.symbology ?? 'code128', el.data);
    const totalModules = sym.modules.length + 2 * sym.quiet;
    const moduleW = Math.max(1, Math.floor(el.width / totalModules));
    const textScale = Math.min(2, moduleW);
    // Human-readable line always uses the always-loaded default font.
    const hriCellH = getFontMeta(DEFAULT_FONT_ID).h;
    const textBlockH = el.showText ? hriCellH * textScale + 2 : 0;
    return {
        modules: sym.modules,
        moduleW,
        barsWidth: moduleW * totalModules,
        barHeight: Math.max(4, el.height - textBlockH),
        textScale,
        textBlockH,
        quiet: sym.quiet,
        hri: sym.hri,
        guards: sym.guards
    };
}

export interface MatrixLayout {
    matrix: boolean[][];
    moduleSize: number;
    /** Actual drawn edge length. */
    size: number;
}

export function dataMatrixLayout(el: DataMatrixElement): MatrixLayout {
    const matrix = encodeDataMatrix(el.data);
    const n = matrix.length;
    const moduleSize = Math.max(1, Math.floor(el.size / n));
    return { matrix, moduleSize, size: moduleSize * n };
}

export interface QrLayout {
    matrix: boolean[][];
    moduleSize: number;
    /** Actual drawn edge length. */
    size: number;
}

export function qrLayout(el: QrElement): QrLayout {
    const matrix = encodeQr(el.data, el.ecLevel);
    const n = matrix.length;
    const moduleSize = Math.max(1, Math.floor(el.size / n));
    return { matrix, moduleSize, size: moduleSize * n };
}

/**
 * Actual drawn bounds of an element. For vector text pass a measurer bound to
 * a canvas context; without one, width falls back to a rough approximation.
 */
/** Padding added around knocked-out text, each side. */
export const DEFAULT_INVERT_PAD = 4;
export function invertPadOf(el: TextElement): number {
    return el.invert ? Math.max(0, Math.round(el.invertPad ?? DEFAULT_INVERT_PAD)) : 0;
}

export interface TextLayout {
    lines: string[];
    /** Size of the glyph block itself. */
    inkW: number;
    inkH: number;
    /** The frame: the declared width/height, or the ink plus padding. */
    boxW: number;
    boxH: number;
    /** Where the glyph block starts inside the frame. */
    dx: number;
    dy: number;
}

/** The glyph block's own size, before any frame is applied. */
function textInk(el: TextElement, lines: string[], measureText?: MeasureTextFn): { w: number; h: number } {
    if (el.font === 'bitmap') {
        // Monospace: bounds are exact from cell dimensions (manifest), so layout
        // is correct before a lazily loaded font's glyphs arrive.
        const { meta, scale } = resolveBitmapFont(el.bitmapFont, el.size);
        const m = measureBitmapText(lines.join('\n'), meta.w, meta.h, scale);
        const extra = (el.italic ? italicShearPx(meta.h, scale) : 0) + (el.bold ? boldExtraPx(scale) : 0);
        return {
            w: Math.max(m.width + extra, meta.w * scale),
            h: Math.max(m.height, meta.h * scale)
        };
    }
    const font = vectorFontString(el);
    const widths = lines.map(line => (measureText ? measureText(line, font) : line.length * el.size * 0.6));
    return {
        w: Math.max(el.size / 2, ...widths),
        h: lines.length * vectorLineHeight(el)
    };
}

/**
 * Where a text element's glyphs sit inside its frame.
 *
 * The single place this is decided, so what the editor selects, what overflow
 * checks measure and what actually prints can never drift apart — the same
 * reason {@link textLines} owns wrapping.
 */
export function textLayout(el: TextElement, measureText?: MeasureTextFn): TextLayout {
    const lines = textLines(el, measureText);
    const ink = textInk(el, lines, measureText);
    const pad = invertPadOf(el);

    const boxW = el.width !== undefined ? Math.max(1, el.width) : ink.w + pad * 2;
    const boxH = el.height !== undefined ? Math.max(1, el.height) : ink.h + pad * 2;

    const dx =
        el.align === 'center' ? (boxW - ink.w) / 2 :
        el.align === 'right' ? boxW - ink.w - pad :
        pad;
    const dy =
        el.valign === 'middle' ? (boxH - ink.h) / 2 :
        el.valign === 'bottom' ? boxH - ink.h - pad :
        pad;

    return { lines, inkW: ink.w, inkH: ink.h, boxW, boxH, dx, dy };
}

export function measureElement(el: AnyElement, measureText?: MeasureTextFn): ElementBounds {
    switch (el.type) {
        case 'text': {
            const t = textLayout(el, measureText);
            return { width: t.boxW, height: t.boxH };
        }
        case 'barcode':
            try {
                const layout = barcodeLayout(el);
                return { width: layout.barsWidth, height: el.height };
            } catch (err) {
                return { width: el.width, height: el.height, error: errText(err) };
            }
        case 'qr':
            try {
                const layout = qrLayout(el);
                return { width: layout.size, height: layout.size };
            } catch (err) {
                return { width: el.size, height: el.size, error: errText(err) };
            }
        case 'datamatrix':
            try {
                const layout = dataMatrixLayout(el);
                return { width: layout.size, height: layout.size };
            } catch (err) {
                return { width: el.size, height: el.size, error: errText(err) };
            }
        case 'shape':
            return { width: Math.max(1, el.width), height: Math.max(1, el.height) };
        case 'symbol':
            return { width: Math.max(1, el.size), height: Math.max(1, el.size) };
        case 'image':
            return { width: el.width, height: el.height };
    }
}

function errText(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

export interface RotatedBounds {
    /** Axis-aligned box the rotated element actually occupies, in canvas px. */
    x: number;
    y: number;
    width: number;
    height: number;
    /** The unrotated content size — what the drawing code lays out in. */
    contentW: number;
    contentH: number;
    /** Carried through from {@link measureElement} so callers need only one call. */
    error?: string;
}

/**
 * Where a rotated element really sits. Rotation happens about the content's
 * centre, so the centre is fixed and only the extent grows.
 *
 * Right angles are computed by swapping the sides rather than through
 * `Math.cos`, whose value at 90° is 6.1e-17 rather than 0 — close enough to be
 * invisible, but it turns exact integers into values like `39.999999999999996`,
 * which then round inconsistently across the editor, the overflow check and the
 * rasterizer.
 */
export function rotatedBounds(el: AnyElement, measureText?: MeasureTextFn): RotatedBounds {
    const b = measureElement(el, measureText);
    const rot = el.rotation ? (((el.rotation % 360) + 360) % 360) : 0;
    let width = b.width;
    let height = b.height;
    if (rot % 90 === 0) {
        if (rot === 90 || rot === 270) { width = b.height; height = b.width; }
    } else {
        const rad = (rot * Math.PI) / 180;
        const c = Math.abs(Math.cos(rad));
        const s = Math.abs(Math.sin(rad));
        width = b.width * c + b.height * s;
        height = b.width * s + b.height * c;
    }
    return {
        x: el.x + b.width / 2 - width / 2,
        y: el.y + b.height / 2 - height / 2,
        width,
        height,
        contentW: b.width,
        contentH: b.height,
        error: b.error
    };
}
