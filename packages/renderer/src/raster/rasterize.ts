/**
 * The design -> printable pixels step.
 *
 * `rasterizeDesign()` is the single function that turns a LabelDesign into the
 * `UniversalImageData` handed to PrintManager.print(). It is independent of
 * the UI framework and of the editor widget; the only environment access goes
 * through the injectable `RasterEnv` (canvas + image decoding), so tests can
 * stub it and the exact same code path feeds preview and printer.
 *
 * Output is strict 1-bit: every pixel (0,0,0,255) or (255,255,255,255).
 */
import type { InkPlane, UniversalPage } from 'universal-label-core';
import type { AnyElement, ImageElement, LabelDesign, ShapeElement, SymbolElement, TextElement } from '../model/design';
import { planInks } from './inkplan';
import { applyDither, thresholdToBW } from './monochrome';
import { drawBitmapText } from './bitmapfont';
import { defaultFont, loadFont, resolveBitmapFont } from './fonts/registry';
import { barcodeLayout, dataMatrixLayout, measureElement, qrLayout, rotatedBounds, textLayout, vectorFontString, vectorLineHeight, type MeasureTextFn } from './measure';
import { parsePath, tracePath } from './svgpath';
import { symbolDef } from './symbols';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface RasterEnv {
    createCanvas(width: number, height: number): AnyCanvas;
    loadImage(src: string): Promise<CanvasImageSource>;
}

/** Default environment for browser main threads (web, Capacitor, Electron renderer). */
export const browserRasterEnv: RasterEnv = {
    createCanvas(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
    },
    async loadImage(src) {
        const img = new Image();
        img.src = src;
        await img.decode();
        return img;
    }
};

function get2d(canvas: AnyCanvas): Ctx2D {
    const ctx = canvas.getContext('2d') as Ctx2D | null;
    if (!ctx) throw new Error('2D canvas context unavailable.');
    return ctx;
}

const imageCache = new Map<string, Promise<CanvasImageSource>>();

function cachedImage(src: string, env: RasterEnv): Promise<CanvasImageSource> {
    let cached = imageCache.get(src);
    if (!cached) {
        cached = env.loadImage(src);
        imageCache.set(src, cached);
        cached.catch(() => imageCache.delete(src));
        // Data URLs are immutable; cap the cache so abandoned imports get dropped.
        if (imageCache.size > 32) {
            const first = imageCache.keys().next().value;
            if (first !== undefined && first !== src) imageCache.delete(first);
        }
    }
    return cached;
}

export interface RasterOptions {
    /**
     * How many separated planes the target printer accepts, from
     * `PrinterCapabilities.colorSupport.channels`. Defaults to 1 — plain
     * monochrome, which is the single-plane case of the same code path.
     */
    inkChannels?: number;
}

/**
 * Render the full design to printer-ready planes.
 *
 * One plane per ink the job actually uses, primary first. On single-colour
 * hardware — which is all of it today — the plan collapses to one plane and
 * this does exactly what it always did.
 */
export async function rasterizeDesign(
    design: LabelDesign,
    env: RasterEnv = browserRasterEnv,
    opts: RasterOptions = {}
): Promise<UniversalPage> {
    const plan = planInks(design, opts.inkChannels ?? 1);

    // Which ink each element ended up on. Elements missing from this map were
    // dropped: they neither print nor knock out, which is the whole point of
    // 'drop' as distinct from printing them in the wrong colour.
    const owner = new Map<string, string>();
    for (const p of plan.planes) for (const el of p.elements) owner.set(el.id, p.ink.id);

    const planes: InkPlane[] = [];
    for (const p of plan.planes) {
        planes.push(await renderPlane(design, env, p.ink.id, owner));
    }
    return { colorModel: 'spot', width: design.widthPx, height: design.heightPx, planes };
}

/**
 * Rasterise one channel.
 *
 * Elements on *other* planes are still drawn, in white — which is what makes
 * overlaps come out right without a separate compositing pass. A dot can only
 * be one colour on this hardware, so the topmost element covering it wins, and
 * painting in z-order with white for "not this ink" produces exactly that.
 *
 * The known simplification is knockout text belonging to another ink: its
 * cut-out glyphs erase this plane along with its block, where strictly the
 * glyphs should let this plane's content show through. Stacking two inks
 * *through* the holes in a third is not something real two-colour stock is used
 * for, and the alternative is a per-element coverage mask on every plane.
 */
async function renderPlane(
    design: LabelDesign,
    env: RasterEnv,
    inkId: string,
    owner: Map<string, string>
): Promise<InkPlane> {
    const canvas = env.createCanvas(design.widthPx, design.heightPx);
    const ctx = get2d(canvas);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, design.widthPx, design.heightPx);

    // Text measurer bound to this context, for rotation-centre computation.
    const measureFn = (text: string, font: string): number => {
        ctx.save();
        ctx.font = font;
        const w = ctx.measureText(text).width;
        ctx.restore();
        return w;
    };

    for (const el of design.elements) {
        const on = owner.get(el.id);
        if (on === undefined) continue; // dropped
        const mode: PaintMode = on === inkId ? 'ink' : 'erase';

        // An element with its own cutoff is reduced to 1-bit *before* it joins
        // the plane, on a canvas of its own. Thresholding it in place is not an
        // option: the final pass sees one canvas and cannot tell which pixels
        // came from which element. Pre-thresholded pixels are pure 0 or 255 and
        // survive that pass untouched, so the two agree.
        if (el.monoThreshold !== undefined && mode === 'ink') {
            await drawPreThresholded(ctx, el, design, env, measureFn);
            continue;
        }

        const rot = el.rotation ? (((el.rotation % 360) + 360) % 360) : 0;
        if (rot) {
            const b = measureElement(el, measureFn);
            ctx.save();
            applyRotation(ctx, rot, el.x + b.width / 2, el.y + b.height / 2);
            await drawElement(ctx, el, design, env, el.x, el.y, mode);
            ctx.restore();
        } else {
            await drawElement(ctx, el, design, env, el.x, el.y, mode);
        }
    }

    const image = ctx.getImageData(0, 0, design.widthPx, design.heightPx);
    // Clamp so already-1-bit pixels (dithered images, bitmap glyphs) survive.
    const level = Math.min(254, Math.max(1, design.threshold));
    thresholdToBW({ data: image.data, width: image.width, height: image.height }, level);
    return { ink: inkId, data: image.data, width: image.width, height: image.height };
}

/**
 * Render a single element to its own canvas — the editor uses this for
 * per-element previews. Same drawing code as the full render; white pixels are
 * made transparent so overlapping elements layer naturally in the editor.
 */
export async function rasterizeElementPreview(el: AnyElement, design: LabelDesign, env: RasterEnv = browserRasterEnv): Promise<AnyCanvas> {
    const ctx0 = get2d(env.createCanvas(1, 1));
    const measureFn: MeasureTextFn = (text, font) => {
        ctx0.font = font;
        return ctx0.measureText(text).width;
    };
    // The preview carries its own rotation rather than letting the editor apply
    // a CSS transform: a CSS rotation resamples the finished 1-bit image, which
    // throws away exactly the hard pixel edges this renderer works to produce.
    // Rotating here means what the canvas shows is the bitmap that will print.
    const rb = rotatedBounds(el, measureFn);
    const rot = el.rotation ? (((el.rotation % 360) + 360) % 360) : 0;
    const quarter = rot % 90 === 0;
    const cw = Math.max(1, Math.ceil(rb.contentW));
    const ch = Math.max(1, Math.ceil(rb.contentH));
    // At right angles the canvas is exactly the content with its sides swapped,
    // so the mapping below is exact — no centre, no rounding, nothing to clip.
    const w = quarter ? (rot === 90 || rot === 270 ? ch : cw) : Math.max(1, Math.ceil(rb.width));
    const h = quarter ? (rot === 90 || rot === 270 ? cw : ch) : Math.max(1, Math.ceil(rb.height));
    const canvas = env.createCanvas(w, h);
    const ctx = get2d(canvas);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    if (quarter) {
        // Map the content box corner-to-corner onto the (already swapped)
        // canvas: (u,v) -> 90°: (ch-v, u) · 180°: (cw-u, ch-v) · 270°: (v, cw-u).
        if (rot === 90) ctx.transform(0, 1, -1, 0, ch, 0);
        else if (rot === 180) ctx.transform(-1, 0, 0, -1, cw, ch);
        else if (rot === 270) ctx.transform(0, -1, 1, 0, 0, cw);
        await drawElement(ctx, el, design, env, 0, 0);
    } else {
        // Free angles resample anyway, so centre the content in its bounding box.
        const ox = (w - rb.contentW) / 2;
        const oy = (h - rb.contentH) / 2;
        applyRotation(ctx, rot, w / 2, h / 2);
        await drawElement(ctx, el, design, env, ox, oy);
    }
    ctx.restore();

    const image = ctx.getImageData(0, 0, w, h);
    // The element's own cutoff where it has one, so the editor shows the same
    // decision the printer will make.
    const level = clampThreshold(el.monoThreshold ?? design.threshold);
    thresholdToBW({ data: image.data, width: w, height: h }, level);
    if (paintsOwnBackground(el)) {
        // A code's quiet zone and the light half of a dithered image are opaque
        // on purpose — they carry meaning, and punching them out would let
        // whatever sits behind show through the symbol and corrupt it.
        //
        // But "opaque" is not the same as "white". Those areas are *unprinted
        // paper*, so on a coloured roll they are that colour — leaving them
        // white put a white card under every dithered photo on yellow stock.
        const substrate = substrateRgb(design);
        if (substrate) {
            const [r, g, b] = substrate;
            for (let i = 0; i < image.data.length; i += 4) {
                if (image.data[i] === 255) {
                    image.data[i] = r;
                    image.data[i + 1] = g;
                    image.data[i + 2] = b;
                }
            }
        }
    } else {
        // Everything else lets white fall away, so overlapping elements layer
        // naturally over whatever the canvas is showing.
        for (let i = 0; i < image.data.length; i += 4) {
            if (image.data[i] === 255) image.data[i + 3] = 0;
        }
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
}

/**
 * Rotate about (cx, cy), snapping right angles to an exact integer transform.
 *
 * The obvious `translate(c); rotate(90°); translate(-c)` maps a pixel to
 * `cx + cy - y`, which lands on a *half* pixel whenever the element's centre
 * does — and a half-pixel offset makes the canvas resample every glyph and bar
 * into grey, which the 1-bit pass then renders as fuzz. (Measured: a bitmap
 * string that is 53 pure-black pixels at 0° became 0 black and 118 grey at 90°.)
 * At right angles the mapping is a pure transposition, so applying it as an
 * integer matrix keeps 1-bit content crisp — which is the entire reason bitmap
 * text, barcodes and matrix codes are restricted to 90° steps in the first place.
 *
 * `transform` (not `setTransform`) so this composes with whatever the caller
 * already has on the context.
 */
export function applyRotation(ctx: Ctx2D, rot: number, cx: number, cy: number): void {
    const step = Math.round(rot);
    if (Math.abs(rot - step) < 1e-6 && step % 90 === 0) {
        const r = Math.round;
        if (step === 90) ctx.transform(0, 1, -1, 0, r(cx + cy), r(cy - cx));
        else if (step === 180) ctx.transform(-1, 0, 0, -1, r(2 * cx), r(2 * cy));
        else if (step === 270) ctx.transform(0, -1, 1, 0, r(cx - cy), r(cx + cy));
        return; // 0° needs no transform at all
    }
    // Free angles resample regardless, so the exact centre is the better choice.
    ctx.translate(cx, cy);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.translate(-cx, -cy);
}

/**
 * Draw one element at its own 1-bit cutoff, then composite it onto the plane.
 *
 * Rendered on a white canvas of its own — the same arrangement the final pass
 * assumes — thresholded there, and then merged. White is punched out afterwards
 * unless the element's light areas are content ({@link paintsOwnBackground}),
 * which is the same rule the editor's per-element previews follow, for the same
 * reason: a barcode's quiet zone must stay opaque or whatever lies beneath will
 * show through and corrupt the symbol.
 */
async function drawPreThresholded(
    ctx: Ctx2D,
    el: AnyElement,
    design: LabelDesign,
    env: RasterEnv,
    measureFn: MeasureTextFn
): Promise<void> {
    const rot = el.rotation ? (((el.rotation % 360) + 360) % 360) : 0;
    const b = measureElement(el, measureFn);
    // Padded so a rotated element and any stroke that sits proud of the
    // measured box are not clipped by their own scratch canvas.
    const pad = Math.ceil(Math.max(b.width, b.height) * (rot ? 0.75 : 0)) + 4;
    const w = Math.max(1, Math.ceil(b.width) + pad * 2);
    const h = Math.max(1, Math.ceil(b.height) + pad * 2);

    const temp = env.createCanvas(w, h);
    const tctx = get2d(temp);
    tctx.fillStyle = '#ffffff';
    tctx.fillRect(0, 0, w, h);
    if (rot) {
        tctx.save();
        applyRotation(tctx, rot, pad + b.width / 2, pad + b.height / 2);
        await drawElement(tctx, el, design, env, pad, pad, 'ink');
        tctx.restore();
    } else {
        await drawElement(tctx, el, design, env, pad, pad, 'ink');
    }

    const image = tctx.getImageData(0, 0, w, h);
    thresholdToBW({ data: image.data, width: w, height: h }, clampThreshold(el.monoThreshold!));
    if (!paintsOwnBackground(el)) {
        for (let i = 0; i < image.data.length; i += 4) {
            if (image.data[i] === 255) image.data[i + 3] = 0;
        }
    }
    tctx.putImageData(image, 0, 0);
    ctx.drawImage(temp, el.x - pad, el.y - pad);
}

/** The usable 1-bit range; 0 and 255 would make everything one colour. */
function clampThreshold(v: number): number {
    return Math.min(254, Math.max(1, Math.round(v)));
}

/**
 * The loaded paper's colour, as RGB — preview only.
 *
 * Returns nothing for plain white stock, so the common case skips the recolour
 * pass entirely. Deliberately confined to `rasterizeElementPreview`: the print
 * path stays strictly 1-bit, because the printer marks dots and has no idea
 * what colour the paper under them is.
 */
function substrateRgb(design: LabelDesign): [number, number, number] | undefined {
    const css = design.paper?.appearance?.baseColor
        ?? design.paper?.appearance?.colorways?.[0]?.color;
    if (!css) return undefined;
    const m = css.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return undefined;
    const hex = m[1];
    const rgb: [number, number, number] = hex.length === 3
        ? [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)]
        : [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    return rgb[0] === 255 && rgb[1] === 255 && rgb[2] === 255 ? undefined : rgb;
}

/**
 * True when an element's *light* areas are part of its content rather than
 * background it should let through.
 *
 * A code's quiet zone and light modules, the spaces between barcode bars, and
 * the whites of a dithered image all carry meaning: a scanner reads them. They
 * must be opaque, so anything already on the canvas cannot show through and
 * corrupt the symbol. Glyphs, outline shapes and symbol artwork are the
 * opposite — they have to composite over whatever is beneath them. (Knockout
 * text paints its own block and so needs nothing here.)
 */
export function paintsOwnBackground(el: AnyElement): boolean {
    return el.type === 'qr' || el.type === 'datamatrix' || el.type === 'barcode' || el.type === 'image';
}

/**
 * Whether an element is being laid down as this plane's ink, or removed from it
 * because it belongs to another plane.
 *
 * 'erase' is not "skip": an element on another ink still occupies those dots, so
 * it has to be painted out of this plane or both channels would claim the same
 * pixel and the printer would have to guess.
 */
type PaintMode = 'ink' | 'erase';

async function drawElement(
    ctx: Ctx2D,
    el: AnyElement,
    design: LabelDesign,
    env: RasterEnv,
    x: number,
    y: number,
    mode: PaintMode = 'ink'
): Promise<void> {
    const erase = mode === 'erase';
    const mark = erase ? '#ffffff' : '#000000';
    if (paintsOwnBackground(el)) {
        // These types are not text, so no measurer is needed for exact bounds.
        const b = measureElement(el);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, Math.max(1, b.width), Math.max(1, b.height));
        // The opaque box has already cleared every dot this element covers, so
        // there is nothing left for an erase pass to do.
        if (erase) return;
    }
    ctx.fillStyle = mark;
    switch (el.type) {
        case 'text':
            await drawText(ctx, el, x, y, mark, erase);
            return;
        case 'barcode':
            try {
                const layout = barcodeLayout(el);
                let bx = x + layout.quiet * layout.moduleW;
                // EAN/UPC guard bars run past the data bars, into the HRI line.
                const guardExtra = layout.guards.length ? Math.round(layout.textBlockH * 0.7) : 0;
                for (let i = 0; i < layout.modules.length; i++) {
                    if (layout.modules[i]) {
                        const tall = layout.guards.some(([s, e]) => i >= s && i < e);
                        ctx.fillRect(bx, y, layout.moduleW, layout.barHeight + (tall ? guardExtra : 0));
                    }
                    bx += layout.moduleW;
                }
                if (el.showText) {
                    drawBitmapText(
                        (rx, ry, rw, rh) => ctx.fillRect(rx, ry, rw, rh),
                        layout.hri,
                        x,
                        y + layout.barHeight + 2,
                        defaultFont(),
                        layout.textScale,
                        'center'
                    );
                }
            } catch {
                drawErrorBox(ctx, x, y, el.width, el.height);
            }
            return;
        case 'qr':
            try {
                const layout = qrLayout(el);
                for (let r = 0; r < layout.matrix.length; r++) {
                    for (let c = 0; c < layout.matrix.length; c++) {
                        if (layout.matrix[r][c]) {
                            ctx.fillRect(x + c * layout.moduleSize, y + r * layout.moduleSize, layout.moduleSize, layout.moduleSize);
                        }
                    }
                }
            } catch {
                drawErrorBox(ctx, x, y, el.size, el.size);
            }
            return;
        case 'datamatrix':
            try {
                const layout = dataMatrixLayout(el);
                for (let r = 0; r < layout.matrix.length; r++) {
                    for (let c = 0; c < layout.matrix.length; c++) {
                        if (layout.matrix[r][c]) {
                            ctx.fillRect(x + c * layout.moduleSize, y + r * layout.moduleSize, layout.moduleSize, layout.moduleSize);
                        }
                    }
                }
            } catch {
                drawErrorBox(ctx, x, y, el.size, el.size);
            }
            return;
        case 'shape':
            drawShape(ctx, el, x, y, mark);
            return;
        case 'symbol':
            drawSymbolElement(ctx, el, x, y);
            return;
        case 'image':
            await drawImageElement(ctx, el, env, x, y);
            return;
    }
}

function drawShape(ctx: Ctx2D, el: ShapeElement, x: number, y: number, mark: string = '#000000'): void {
    const w = Math.max(1, el.width);
    const h = Math.max(1, el.height);
    const stroke = Math.max(1, Math.round(el.stroke));
    ctx.lineWidth = stroke;
    ctx.strokeStyle = mark;

    if (el.shape === 'line') {
        // A rule runs along the box's longer axis, through its centre — so the
        // box can be stretched by a constraint while the line stays thin.
        const horizontal = w >= h;
        const dash = Math.max(0, Math.round(el.dash ?? 0));
        // Half-pixel offset keeps an odd-width stroke on the pixel grid.
        const off = stroke % 2 === 1 ? 0.5 : 0;
        ctx.beginPath();
        if (horizontal) {
            const cy = Math.round(y + h / 2) + off;
            strokeRun(ctx, x, cy, x + w, cy, dash);
        } else {
            const cx = Math.round(x + w / 2) + off;
            strokeRun(ctx, cx, y, cx, y + h, dash);
        }
        return;
    }

    // Inset by half the stroke so an outline stays inside the element bounds.
    const i = el.fill ? 0 : stroke / 2;
    ctx.beginPath();
    if (el.shape === 'ellipse') {
        ellipsePath(ctx, x + w / 2, y + h / 2, Math.max(0.5, w / 2 - i), Math.max(0.5, h / 2 - i));
    } else {
        const r = Math.max(0, Math.min(el.radius ?? 0, w / 2 - i, h / 2 - i));
        roundRectPath(ctx, x + i, y + i, Math.max(1, w - 2 * i), Math.max(1, h - 2 * i), r);
    }
    if (el.fill) ctx.fill(); else ctx.stroke();
}

/** A straight run, optionally dashed, without relying on setLineDash support. */
function strokeRun(ctx: Ctx2D, x0: number, y0: number, x1: number, y1: number, dash: number): void {
    if (dash <= 0) {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        return;
    }
    const len = Math.hypot(x1 - x0, y1 - y0);
    const ux = (x1 - x0) / (len || 1);
    const uy = (y1 - y0) / (len || 1);
    for (let d = 0; d < len; d += dash * 2) {
        const e = Math.min(len, d + dash);
        ctx.moveTo(x0 + ux * d, y0 + uy * d);
        ctx.lineTo(x0 + ux * e, y0 + uy * e);
    }
    ctx.stroke();
}

function ellipsePath(ctx: Ctx2D, cx: number, cy: number, rx: number, ry: number): void {
    // Four cubic segments — `ctx.ellipse` is not universally available headless.
    const k = 0.5522847498;
    ctx.moveTo(cx + rx, cy);
    ctx.bezierCurveTo(cx + rx, cy + ry * k, cx + rx * k, cy + ry, cx, cy + ry);
    ctx.bezierCurveTo(cx - rx * k, cy + ry, cx - rx, cy + ry * k, cx - rx, cy);
    ctx.bezierCurveTo(cx - rx, cy - ry * k, cx - rx * k, cy - ry, cx, cy - ry);
    ctx.bezierCurveTo(cx + rx * k, cy - ry, cx + rx, cy - ry * k, cx + rx, cy);
    ctx.closePath();
}

function roundRectPath(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
    if (r <= 0) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        return;
    }
    const k = 0.5522847498 * r;
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.bezierCurveTo(x + w - r + k, y, x + w, y + r - k, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.bezierCurveTo(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.bezierCurveTo(x + r - k, y + h, x, y + h - r + k, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.bezierCurveTo(x, y + r - k, x + r - k, y, x + r, y);
    ctx.closePath();
}

function drawSymbolElement(ctx: Ctx2D, el: SymbolElement, x: number, y: number): void {
    const art = el.path ?? symbolDef(el.name);
    const size = Math.max(1, el.size);
    try {
        const cmds = parsePath(art.d);
        const [vx, vy, vw, vh] = art.viewBox;
        // Fit the artwork into the square, preserving aspect and centring it.
        const k = Math.min(size / (vw || 1), size / (vh || 1));
        const ox = x + (size - vw * k) / 2;
        const oy = y + (size - vh * k) / 2;
        tracePath(ctx, cmds, (px, py) => [ox + (px - vx) * k, oy + (py - vy) * k]);
        ctx.fill(art.fillRule === 'evenodd' ? 'evenodd' : 'nonzero');
    } catch {
        drawErrorBox(ctx, x, y, size, size);
    }
}

async function drawText(
    ctx: Ctx2D,
    el: TextElement,
    x: number,
    y: number,
    mark: string = '#000000',
    erase: boolean = false
): Promise<void> {
    // Wrapping is decided once, in measure.ts, so what prints is exactly what
    // the editor measured and laid out.
    const measureFn: MeasureTextFn = (text, font) => {
        ctx.save();
        ctx.font = font;
        const w = ctx.measureText(text).width;
        ctx.restore();
        return w;
    };
    // One layout decides wrapping, the frame and the block's place in it, so
    // what prints is exactly what was measured and selected.
    const layout = textLayout(el, measureFn);
    const lines = layout.lines;

    // Knockout: lay a solid block over the whole frame, then draw the glyphs in
    // white on top of it.
    if (el.invert) {
        ctx.fillStyle = mark;
        ctx.fillRect(x, y, layout.boxW, layout.boxH);
        // Erasing this element off another plane: the block has already cleared
        // the frame, and drawing the glyphs now would put ink back. (See
        // renderPlane — this is where knockout over-erases by its cut-outs.)
        if (erase) return;
        ctx.fillStyle = '#ffffff';
    }
    // Position the glyph block within the frame (align / valign).
    x += layout.dx;
    y += layout.dy;

    if (el.font === 'bitmap') {
        const resolved = resolveBitmapFont(el.bitmapFont, el.size);
        const font = await loadFont(resolved.id);
        drawBitmapText(
            (rx, ry, rw, rh) => ctx.fillRect(rx, ry, rw, rh),
            lines.join('\n'), x, y, font, resolved.scale, el.align,
            { bold: el.bold, italic: el.italic, underline: el.underline }
        );
        return;
    }
    // Vector: weight/style come from the font string; underline is drawn manually.
    ctx.font = vectorFontString(el);
    ctx.textBaseline = 'top';
    const lineHeight = vectorLineHeight(el);
    const widths = lines.map(line => ctx.measureText(line).width);
    const blockWidth = Math.max(...widths);
    const underlineThickness = Math.max(1, Math.round(el.size / 14));
    lines.forEach((line, i) => {
        const dx =
            el.align === 'center' ? (blockWidth - widths[i]) / 2 :
            el.align === 'right' ? blockWidth - widths[i] :
            0;
        const lineY = y + i * lineHeight;
        ctx.fillText(line, x + dx, lineY);
        if (el.underline && line.length > 0) {
            ctx.fillRect(x + dx, lineY + Math.round(el.size * 1.02), widths[i], underlineThickness);
        }
    });
}

async function drawImageElement(ctx: Ctx2D, el: ImageElement, env: RasterEnv, x: number, y: number): Promise<void> {
    const w = Math.max(1, Math.round(el.width));
    const h = Math.max(1, Math.round(el.height));
    if (!el.src) {
        drawErrorBox(ctx, x, y, w, h);
        return;
    }
    let source: CanvasImageSource;
    try {
        source = await cachedImage(el.src, env);
    } catch {
        drawErrorBox(ctx, x, y, w, h);
        return;
    }
    const temp = env.createCanvas(w, h);
    const tctx = get2d(temp);
    tctx.fillStyle = '#ffffff';
    tctx.fillRect(0, 0, w, h);
    tctx.drawImage(source, 0, 0, w, h);
    const image = tctx.getImageData(0, 0, w, h);
    applyDither({ data: image.data, width: w, height: h }, el.mode, el.threshold, el.invert);
    tctx.putImageData(image, 0, 0);
    ctx.drawImage(temp, x, y);
}

/** Crossed box marking an element that cannot render (bad data, missing image). */
function drawErrorBox(ctx: Ctx2D, x: number, y: number, w: number, h: number): void {
    ctx.fillRect(x, y, w, 1);
    ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x, y, 1, h);
    ctx.fillRect(x + w - 1, y, 1, h);
    const steps = Math.max(w, h);
    for (let i = 0; i < steps; i++) {
        ctx.fillRect(x + (i / steps) * w, y + (i / steps) * h, 1, 1);
    }
}
