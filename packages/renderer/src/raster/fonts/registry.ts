/**
 * Bitmap-font registry.
 *
 * Fonts are pre-converted from BDF to compact JSON glyph modules at build time
 * (see scripts/bundle-bdf.mjs). Only the tiny default font (fixed-5x7) ships in
 * the main bundle — statically imported so it is always available synchronously
 * for barcodes and as a fallback. Every other font is a separate lazy chunk,
 * fetched on demand the first time a label actually uses it, so the font
 * catalogue never inflates the initial download.
 *
 * All these fonts are monospace, which is the trick that keeps the API simple:
 * text *layout* (bounds, hit-testing, snapping) needs only the cell dimensions,
 * available synchronously from the small static manifest; only the pixel
 * *drawing* needs the glyph bitmaps, and that happens inside the already-async
 * rasterizer.
 */
import manifestRaw from './manifest.json';
import defaultGlyphs from './data/fixed-5x7.json';

export interface FontMeta {
    id: string;
    label: string;
    /** Cell width in px (monospace advance). */
    w: number;
    /** Cell height in px (line height). */
    h: number;
    glyphCount: number;
}

export interface BitmapFont {
    id: string;
    w: number;
    h: number;
    /** code point -> row-major bitmap; bytesPerRow = ceil(w/8), bit 7 = leftmost pixel. */
    glyphs: Map<number, Uint8Array>;
}

interface RawFont {
    w: number;
    h: number;
    glyphs: Record<string, string>;
}

export const FONT_MANIFEST: FontMeta[] = manifestRaw as FontMeta[];
export const DEFAULT_FONT_ID = 'fixed-5x7';

const metaById = new Map(FONT_MANIFEST.map(m => [m.id, m] as const));

// ---- Font families ----
// The picker offers a family (Fixed / Terminus / Spleen), not 38 individual
// sizes; the resolver then chooses the crispest master + integer scale for the
// target height. Only normal-weight masters are grouped (ids ending in 'b' are
// the bold variants of Fixed/Terminus).

export interface FontFamily {
    key: string;
    label: string;
    /** Member font ids, ascending by cell height. */
    memberIds: string[];
}

function familyKeyOf(id: string): string {
    if (id.startsWith('ter-u')) return 'terminus';
    if (id.startsWith('spleen-')) return 'spleen';
    return 'fixed';
}

const FAMILY_LABELS: Record<string, string> = {
    fixed: 'Fixed (X11)',
    terminus: 'Terminus',
    spleen: 'Spleen'
};

export const FONT_FAMILIES: FontFamily[] = (() => {
    const byKey = new Map<string, FontMeta[]>();
    for (const m of FONT_MANIFEST) {
        if (m.id.endsWith('b')) continue; // skip bold variants — keep the picker simple
        const key = familyKeyOf(m.id);
        (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(m);
    }
    const order = ['fixed', 'terminus', 'spleen'];
    return [...byKey.entries()]
        .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
        .map(([key, metas]) => ({
            key,
            label: FAMILY_LABELS[key] ?? key,
            memberIds: metas.sort((a, b) => a.h - b.h).map(m => m.id)
        }));
})();

const familyByKey = new Map(FONT_FAMILIES.map(f => [f.key, f] as const));
export const DEFAULT_FONT_FAMILY = 'fixed';

export interface ResolvedFont {
    /** Concrete master font id to load/draw. */
    id: string;
    meta: FontMeta;
    /** Integer scale factor to reach ~the target height. */
    scale: number;
    /** Actual rendered glyph height in px (meta.h * scale). */
    renderedH: number;
}

/**
 * Cost (in px) added per extra integer upscale step. This makes the resolver
 * prefer a higher-resolution master rendered at 1× (or 2×) over blowing a tiny
 * master up 3–4× just to hit the exact target — small pixel fonts scaled hard
 * look coarse. Tuned so a clean 2× still wins over a ~4px-off 1× match, but a
 * 3×/4× match loses to a near 1×/2× one.
 */
const UPSCALE_PENALTY = 2;

/**
 * Resolve a text element's `bitmapFont` (a family key OR a concrete master id)
 * plus a target height into a crisp concrete master + integer scale.
 *
 * Score = |renderedHeight − target| + UPSCALE_PENALTY·(scale − 1); lowest wins,
 * ties break to the higher-resolution master. So the target is matched exactly
 * when a master (or a gentle multiple of one) lands on it, and otherwise the
 * closest master is used at a modest scale — never fractional, never an
 * aggressive upscale of a tiny font.
 */
export function resolveBitmapFont(key: string | undefined, targetHeightPx: number): ResolvedFont {
    const direct = key !== undefined ? metaById.get(key) : undefined;
    const candidates: FontMeta[] = direct
        ? [direct]
        : (familyByKey.get(key ?? DEFAULT_FONT_FAMILY) ?? familyByKey.get(DEFAULT_FONT_FAMILY)!)
            .memberIds.map(id => metaById.get(id)!)
            .filter((m): m is FontMeta => m !== undefined);
    if (candidates.length === 0) candidates.push(metaById.get(DEFAULT_FONT_ID)!);

    const target = Math.max(1, targetHeightPx);
    let best: ResolvedFont | null = null;
    let bestScore = Infinity;
    for (const meta of candidates) {
        const scale = Math.max(1, Math.round(target / meta.h));
        const renderedH = meta.h * scale;
        const score = Math.abs(renderedH - target) + UPSCALE_PENALTY * (scale - 1);
        if (score < bestScore || (score === bestScore && best !== null && meta.h > best.meta.h)) {
            best = { id: meta.id, meta, scale, renderedH };
            bestScore = score;
        }
    }
    return best!;
}

function decodeFont(id: string, raw: RawFont): BitmapFont {
    const glyphs = new Map<number, Uint8Array>();
    for (const [code, hex] of Object.entries(raw.glyphs)) {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
        }
        glyphs.set(Number(code), bytes);
    }
    return { id, w: raw.w, h: raw.h, glyphs };
}

const cache = new Map<string, BitmapFont>();
cache.set(DEFAULT_FONT_ID, decodeFont(DEFAULT_FONT_ID, defaultGlyphs as RawFont));

const pending = new Map<string, Promise<BitmapFont>>();

/** Cell metrics for layout — synchronous, exact for monospace, defaults gracefully. */
export function getFontMeta(id: string | undefined): FontMeta {
    return (id !== undefined && metaById.get(id)) || metaById.get(DEFAULT_FONT_ID)!;
}

/** The always-loaded default font (barcode HRI text, fallbacks). */
export function defaultFont(): BitmapFont {
    return cache.get(DEFAULT_FONT_ID)!;
}

/** Already-loaded glyphs for a font, or the default if not yet fetched. */
export function getLoadedFont(id: string | undefined): BitmapFont {
    return (id !== undefined && cache.get(id)) || defaultFont();
}

/**
 * Fetch a font's glyphs (lazy chunk), caching the result. Unknown ids resolve
 * to the default font rather than rejecting, so a design referencing a font
 * that was removed still renders.
 */
export async function loadFont(id: string | undefined): Promise<BitmapFont> {
    if (id === undefined || !metaById.has(id)) return defaultFont();
    const hit = cache.get(id);
    if (hit) return hit;

    let inflight = pending.get(id);
    if (!inflight) {
        inflight = import(`./data/${id}.json`)
            .then((mod: { default: RawFont }) => {
                const font = decodeFont(id, mod.default);
                cache.set(id, font);
                pending.delete(id);
                return font;
            })
            .catch(err => {
                pending.delete(id);
                console.warn(`[fonts] failed to load "${id}", using default:`, err);
                return defaultFont();
            });
        pending.set(id, inflight);
    }
    return inflight;
}
