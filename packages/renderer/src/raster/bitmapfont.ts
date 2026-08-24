/**
 * Bitmap-font text rendering over the monospace fonts in `./fonts` (BDF glyph
 * sets converted to JSON at build time). Glyphs are drawn as integer-scaled
 * filled rectangles, so text is pixel-exact at any zoom and never
 * anti-aliased — which is what keeps small label text crisp after 1-bit
 * conversion.
 *
 * Framework- and canvas-agnostic: drawing goes through a fillRect callback.
 * Layout math takes only cell dimensions, so it works from the manifest before
 * a font's glyphs have loaded.
 */
import type { BitmapFont } from './fonts/registry';

export type FillRect = (x: number, y: number, w: number, h: number) => void;

export interface TextStyle {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
}

/** Faux-italic slant (horizontal shift per row, as a fraction of the row size). */
export const ITALIC_SLANT = 0.22;

/** Horizontal shear (px) added to a glyph's width when faux-italic is applied. */
export function italicShearPx(cellH: number, scale: number): number {
    return Math.round((cellH - 1) * scale * ITALIC_SLANT);
}

/** Extra advance (px) added to overall width when faux-bold is applied. */
export function boldExtraPx(scale: number): number {
    return scale;
}

/** Integer scale factor so a font of the given cell height ~matches a target px. */
export function bitmapScaleForSize(sizePx: number, cellH: number): number {
    return Math.max(1, Math.round(sizePx / cellH));
}

export interface TextMetrics2D {
    width: number;
    height: number;
    lineWidths: number[];
}

/** Monospace layout: advance = cellW, line height = cellH (spacing is baked into the cell). */
export function measureBitmapText(text: string, cellW: number, cellH: number, scale: number): TextMetrics2D {
    const lines = text.split('\n');
    const lineWidths = lines.map(line => line.length * cellW * scale);
    return {
        width: Math.max(0, ...lineWidths),
        height: lines.length * cellH * scale,
        lineWidths
    };
}

/**
 * Draw text at (x, y) top-left in the given font. Characters absent from the
 * font render as a hollow box so the user sees an unsupported glyph rather than
 * silently losing it.
 */
export function drawBitmapText(
    fill: FillRect,
    text: string,
    x: number,
    y: number,
    font: BitmapFont,
    scale: number,
    align: 'left' | 'center' | 'right' = 'left',
    style: TextStyle = {}
): void {
    const bpr = Math.ceil(font.w / 8);
    const metrics = measureBitmapText(text, font.w, font.h, scale);
    const shear = style.italic ? italicShearPx(font.h, scale) : 0;
    const bold = style.bold === true;
    const lines = text.split('\n');
    // Per-row horizontal shear: top rows lean furthest right.
    const shearAt = (row: number) => (style.italic ? Math.round((font.h - 1 - row) * scale * ITALIC_SLANT) : 0);

    lines.forEach((line, lineIdx) => {
        const lineWidth = metrics.lineWidths[lineIdx];
        const startX =
            align === 'center' ? x + (metrics.width + shear - lineWidth) / 2 :
            align === 'right' ? x + metrics.width + shear - lineWidth :
            x;
        const lineY = y + lineIdx * font.h * scale;
        for (let c = 0; c < line.length; c++) {
            const cx = Math.round(startX + c * font.w * scale);
            const code = line.codePointAt(c) ?? 32;
            if (code === 32) continue;
            const glyph = font.glyphs.get(code);
            if (!glyph) {
                drawFallbackBox(fill, cx, lineY, font.w, font.h, scale);
                continue;
            }
            for (let row = 0; row < font.h; row++) {
                const rowShear = shearAt(row);
                for (let col = 0; col < font.w; col++) {
                    const bit = (glyph[row * bpr + (col >> 3)] >> (7 - (col & 7))) & 1;
                    if (!bit) continue;
                    const px = cx + col * scale + rowShear;
                    const py = lineY + row * scale;
                    fill(px, py, scale, scale);
                    if (bold) fill(px + scale, py, scale, scale); // faux-bold: thicken by one module
                }
            }
        }
        if (style.underline) {
            // A bar on the cell's bottom row, spanning the (sheared) line width.
            const uy = lineY + (font.h - 1) * scale;
            fill(Math.round(startX), uy, lineWidth + shear + (bold ? scale : 0), scale);
        }
    });
}

function drawFallbackBox(fill: FillRect, x: number, y: number, cellW: number, cellH: number, scale: number): void {
    const w = Math.max(1, cellW - 1) * scale;
    const h = Math.max(1, cellH - 1) * scale;
    fill(x, y, w, scale);
    fill(x, y + h - scale, w, scale);
    fill(x, y, scale, h);
    fill(x + w - scale, y, scale, h);
}
