/**
 * Browser-backed text measurer for `measureElement()` — one shared hidden
 * canvas context, created lazily so importing this module stays side-effect
 * free in non-DOM environments.
 */
import type { MeasureTextFn } from './measure';

let ctx: CanvasRenderingContext2D | null = null;

export const domMeasureText: MeasureTextFn = (text, font) => {
    if (!ctx) {
        ctx = document.createElement('canvas').getContext('2d');
        if (!ctx) return text.length * 8;
    }
    ctx.font = font;
    return ctx.measureText(text).width;
};
