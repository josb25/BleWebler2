/**
 * Separated planes -> something a human can look at.
 *
 * The print path deals in coverage: a plane says "this dot gets developed", not
 * "this dot is red". Turning that back into a picture is a preview concern and
 * lives here, deliberately apart from the rasterizer, so no colour ever leaks
 * into what gets sent to a printer.
 *
 * Composition is multiplicative because that is what the physical stack does:
 * ink develops *within* the paper rather than sitting on top of it, so a mark on
 * green stock is the mark multiplied by green, and a black mark over a red one
 * is black. The same rule covers substrate colour, factory-preprinted artwork
 * and overlapping channels, which is why there are no special cases below.
 */
import type { Ink, UniversalPage } from 'universal-label-core';
import { DEFAULT_INK } from 'universal-label-core';

export interface CompositeOptions {
    /**
     * The colorants, for looking up each plane's display colour. Planes name an
     * ink id; only the media knows what that looks like.
     */
    inks?: readonly Ink[];
    /** Substrate colour under everything. Defaults to white paper. */
    background?: string;
    /**
     * Factory-preprinted artwork, already rasterised to the page size, as RGBA.
     * Multiplied in beneath the ink, since thermal marks develop under it.
     */
    preprint?: { data: Uint8Array | Uint8ClampedArray; width: number; height: number };
}

export interface CompositeImage {
    data: Uint8ClampedArray;
    width: number;
    height: number;
}

/**
 * Flatten a page into displayable RGBA.
 *
 * Works for the one-plane case too, which is what keeps every existing preview
 * on a single code path: a black plane over white paper multiplies out to
 * exactly the bitmap it already showed.
 */
export function compositePage(page: UniversalPage, opts: CompositeOptions = {}): CompositeImage {
    const { width, height } = page;
    const out = new Uint8ClampedArray(width * height * 4);

    const bg = parseRgb(opts.background ?? '#ffffff') ?? [255, 255, 255];
    for (let i = 0; i < out.length; i += 4) {
        out[i] = bg[0];
        out[i + 1] = bg[1];
        out[i + 2] = bg[2];
        out[i + 3] = 255;
    }

    if (opts.preprint && opts.preprint.width === width && opts.preprint.height === height) {
        const art = opts.preprint.data;
        for (let i = 0; i < out.length; i += 4) {
            // Unpainted areas of the artwork arrive as transparent or white;
            // either way multiplying by them leaves the substrate alone.
            const a = art[i + 3] / 255;
            if (a === 0) continue;
            out[i] = mul(out[i], lerp(255, art[i], a));
            out[i + 1] = mul(out[i + 1], lerp(255, art[i + 1], a));
            out[i + 2] = mul(out[i + 2], lerp(255, art[i + 2], a));
        }
    }

    if (page.colorModel === 'rgb') {
        // A full-gamut page is already the picture; there is nothing to separate
        // and nothing to look up.
        const src = page.data;
        for (let i = 0; i < out.length; i += 4) {
            out[i] = mul(out[i], src[i]);
            out[i + 1] = mul(out[i + 1], src[i + 1]);
            out[i + 2] = mul(out[i + 2], src[i + 2]);
        }
        return { data: out, width, height };
    }

    for (const plane of page.planes) {
        const ink = opts.inks?.find(i => i.id === plane.ink) ?? DEFAULT_INK;
        const c = parseRgb(ink.color) ?? [17, 17, 17];
        const src = plane.data;
        for (let i = 0; i < out.length; i += 4) {
            // Planes are 1-bit by the time they get here, so one channel decides.
            if (src[i] >= 128) continue;
            out[i] = mul(out[i], c[0]);
            out[i + 1] = mul(out[i + 1], c[1]);
            out[i + 2] = mul(out[i + 2], c[2]);
        }
    }

    return { data: out, width, height };
}

/**
 * Relative luminance of a colour, 0..1.
 *
 * Used to warn when dark stock will swallow a dark ink — the case the tree-green
 * and deep-blue rolls actually hit, where the print is technically perfect and
 * completely unreadable.
 */
export function luminance(css: string): number {
    const c = parseRgb(css);
    if (!c) return 1;
    const lin = c.map(v => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/**
 * WCAG contrast ratio between an ink and its substrate, 1..21.
 *
 * Not a typography rule here — it is the closest cheap proxy for "will anyone be
 * able to read this label", and it is the number the editor's warning is keyed
 * off.
 */
export function contrastRatio(inkColor: string, substrate: string): number {
    const a = luminance(inkColor);
    const b = luminance(substrate);
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    return (hi + 0.05) / (lo + 0.05);
}

function mul(a: number, b: number): number { return Math.round((a * b) / 255); }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

/** Parse `#rgb` / `#rrggbb`. Anything else is "no usable colour". */
function parseRgb(css: string): [number, number, number] | undefined {
    const m = css.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return undefined;
    const hex = m[1];
    if (hex.length === 3) {
        return [
            parseInt(hex[0] + hex[0], 16),
            parseInt(hex[1] + hex[1], 16),
            parseInt(hex[2] + hex[2], 16)
        ];
    }
    return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16)
    ];
}
