/**
 * The ULT Paper file — one media format, shareable.
 *
 * Someone who works out the exact die line, gap pitch and colourway of an
 * obscure roll has done real work, and today that work is trapped in their
 * settings. This is the format that lets them hand it to someone else.
 *
 * Everything here is untrusted on the way in, and the die line is the sharp
 * edge: it is SVG path data from a stranger, so it goes through the same
 * geometry-only gate as symbol artwork ({@link isValidPath}) rather than being
 * trusted because it *looks* like a path. Preprinted artwork is bounded the
 * same way embedded images are elsewhere, and for the same reason — the paper
 * library shares one storage key with everything else.
 */

import type { Ink, MediaDie, PaperAppearance, PaperProfile } from 'universal-label-core';
import { isValidPath, PATH_LIMITS } from '../raster/svgpath';

export const PAPER_FILE_LIMITS = {
    maxHoles: 12,
    maxKeepClear: 12,
    maxColorways: 24,
    maxInks: 8,
    maxName: 200,
    /** Preprinted artwork, sanitised SVG or an embedded raster. */
    maxArtworkBytes: 260 * 1024
} as const;

export interface PaperFile {
    version: 1;
    kind: 'label-paper';
    paper: PaperProfile;
}

export interface PaperParseOk { ok: true; paper: PaperProfile; warnings: string[]; }
export interface PaperParseErr { ok: false; errors: string[]; }
export type PaperParseResult = PaperParseOk | PaperParseErr;

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp|gif|avif|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const MEDIA_TYPES = new Set<PaperProfile['type']>([
    'gap', 'continuous', 'transparent', 'black', 'perforated', 'pvc', 'black-mark', 'heat-shrink'
]);

function isObj(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function str(v: unknown, fallback = ''): string { return typeof v === 'string' ? v : fallback; }
function num(v: unknown): number | undefined {
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
function clip(s: string, max: number): string { return s.length > max ? s.slice(0, max) : s; }

export function buildPaperFile(paper: PaperProfile): PaperFile {
    return { version: 1, kind: 'label-paper', paper };
}

export function serializePaperFile(file: PaperFile): string {
    return JSON.stringify(file, null, 2);
}

/**
 * Validate untrusted JSON into a safe {@link PaperProfile}.
 *
 * Rebuilt field by field rather than filtered, so anything unrecognised is
 * dropped rather than carried. Malformed *decoration* — a bad colour, an
 * unusable hole — warns and is dropped; only a paper with no usable size at all
 * is rejected outright, because a profile that cannot say how wide it is has
 * nothing to offer.
 */
export function parsePaperFile(input: unknown): PaperParseResult {
    if (!isObj(input)) return { ok: false, errors: ['Not a paper file'] };
    if (input.kind !== 'label-paper') return { ok: false, errors: ['Not a label paper file (bad "kind")'] };
    if (input.version !== 1) return { ok: false, errors: [`Unsupported paper file version ${String(input.version)}`] };
    if (!isObj(input.paper)) return { ok: false, errors: ['The file carries no paper profile'] };

    const raw = input.paper;
    const warnings: string[] = [];

    const tapeWidthMm = num(raw.tapeWidthMm);
    if (tapeWidthMm === undefined || tapeWidthMm <= 0 || tapeWidthMm > 300) {
        return { ok: false, errors: ['Paper has no usable tape width'] };
    }

    const type = MEDIA_TYPES.has(raw.type as PaperProfile['type'])
        ? (raw.type as PaperProfile['type'])
        : 'gap';
    if (raw.type !== undefined && type !== raw.type) {
        warnings.push(`Unknown media type "${clip(str(raw.type), 30)}" — treated as gap`);
    }

    const paper: PaperProfile = {
        // A fresh id on import: two people's "12x40" are not the same profile,
        // and silently overwriting one with the other would be worse than
        // ending up with two entries.
        id: `paper_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        name: clip(str(raw.name, 'Imported paper'), PAPER_FILE_LIMITS.maxName),
        type,
        tapeWidthMm
    };

    const labelLengthMm = num(raw.labelLengthMm);
    if (labelLengthMm !== undefined && labelLengthMm > 0) paper.labelLengthMm = labelLengthMm;
    const labelWidthMm = num(raw.labelWidthMm);
    if (labelWidthMm !== undefined && labelWidthMm > 0) paper.labelWidthMm = Math.min(labelWidthMm, tapeWidthMm);
    const gapMm = num(raw.gapMm);
    if (gapMm !== undefined && gapMm >= 0) paper.gapMm = gapMm;
    const borderRadiusMm = num(raw.borderRadiusMm);
    if (borderRadiusMm !== undefined && borderRadiusMm >= 0) paper.borderRadiusMm = borderRadiusMm;

    const rot = num(raw.mountRotationDeg);
    if (rot === 0 || rot === 90 || rot === 180 || rot === 270) paper.mountRotationDeg = rot;

    const die = parseDie(raw.die, warnings);
    if (die) paper.die = die;

    const holes = parsePaths(raw.holesMm, PAPER_FILE_LIMITS.maxHoles, 'Hole', warnings);
    if (holes.length) paper.holesMm = holes;

    const keepClear = parsePaths(raw.keepClearMm, PAPER_FILE_LIMITS.maxKeepClear, 'Keep-clear area', warnings);
    if (keepClear.length) paper.keepClearMm = keepClear;

    const inks = parseInks(raw.inks, warnings);
    if (inks.length) paper.inks = inks;

    const appearance = parseAppearance(raw.appearance, warnings);
    if (appearance) paper.appearance = appearance;

    const hint = parseDensityHint(raw.densityHint);
    if (hint) paper.densityHint = hint;

    return { ok: true, paper, warnings };
}

export function parsePaperFileJSON(json: string): PaperParseResult {
    try {
        return parsePaperFile(JSON.parse(json));
    } catch {
        return { ok: false, errors: ['That file is not valid JSON'] };
    }
}

function parseDie(raw: unknown, warnings: string[]): MediaDie | undefined {
    if (!isObj(raw)) return undefined;
    if (raw.kind === 'ellipse') return { kind: 'ellipse' };
    if (raw.kind === 'rect') {
        const r = raw.radiiMm;
        if (typeof r === 'number' && Number.isFinite(r) && r >= 0) return { kind: 'rect', radiiMm: r };
        if (Array.isArray(r) && r.length === 4 && r.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)) {
            return { kind: 'rect', radiiMm: r as [number, number, number, number] };
        }
        return { kind: 'rect' };
    }
    if (raw.kind === 'path') {
        const d = str(raw.dMm).trim();
        // Length first: `isValidPath` walks the string, and an enormous one is
        // exactly what a hostile file would send.
        if (d.length > PATH_LIMITS.maxLength || !isValidPath(d)) {
            warnings.push('The outline could not be read — falling back to a rectangle');
            return undefined;
        }
        return { kind: 'path', dMm: d, fillRule: raw.fillRule === 'evenodd' ? 'evenodd' : 'nonzero' };
    }
    return undefined;
}

/** A capped list of sanitised path strings. */
function parsePaths(raw: unknown, max: number, label: string, warnings: string[]): string[] {
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const [i, entry] of raw.slice(0, max).entries()) {
        const d = str(entry).trim();
        if (d.length > PATH_LIMITS.maxLength || !isValidPath(d)) {
            warnings.push(`${label} ${i + 1} could not be read — dropped`);
            continue;
        }
        out.push(d);
    }
    if (raw.length > max) warnings.push(`Only the first ${max} ${label.toLowerCase()} entries were kept`);
    return out;
}

function parseInks(raw: unknown, warnings: string[]): Ink[] {
    if (!Array.isArray(raw)) return [];
    const out: Ink[] = [];
    const seen = new Set<string>();
    for (const entry of raw.slice(0, PAPER_FILE_LIMITS.maxInks)) {
        if (!isObj(entry)) continue;
        const id = str(entry.id).trim();
        if (!id || seen.has(id)) continue;
        const color = str(entry.color).trim();
        if (!HEX.test(color)) {
            warnings.push(`Ink "${clip(id, 30)}" has an unusable colour — dropped`);
            continue;
        }
        seen.add(id);
        const via = isObj(entry.produced) && entry.produced.via === 'ribbon' ? 'ribbon' : 'thermal';
        const band = isObj(entry.produced) && (entry.produced.energyBand === 'low' || entry.produced.energyBand === 'high')
            ? entry.produced.energyBand
            : undefined;
        out.push({
            id,
            color,
            name: entry.name !== undefined ? clip(str(entry.name), PAPER_FILE_LIMITS.maxName) : undefined,
            primary: entry.primary === true || undefined,
            produced: via === 'ribbon' ? { via: 'ribbon' } : { via: 'thermal', ...(band ? { energyBand: band } : {}) }
        });
    }
    return out;
}

function parseAppearance(raw: unknown, warnings: string[]): PaperAppearance | undefined {
    if (!isObj(raw)) return undefined;
    const out: PaperAppearance = {};

    if (Array.isArray(raw.colorways)) {
        const ways: NonNullable<PaperAppearance['colorways']> = [];
        for (const entry of raw.colorways.slice(0, PAPER_FILE_LIMITS.maxColorways)) {
            if (!isObj(entry)) continue;
            const color = str(entry.color).trim();
            if (!HEX.test(color)) continue;
            ways.push({
                id: clip(str(entry.id) || color, 60),
                name: clip(str(entry.name) || color, PAPER_FILE_LIMITS.maxName),
                color
            });
        }
        if (ways.length) out.colorways = ways;
    }

    const base = str(raw.baseColor).trim();
    if (base) {
        if (HEX.test(base)) out.baseColor = base;
        else warnings.push(`Unusable substrate colour "${clip(base, 20)}" — dropped`);
    }

    if (raw.finish === 'matte' || raw.finish === 'gloss' || raw.finish === 'transparent' || raw.finish === 'metallic') {
        out.finish = raw.finish;
    }

    if (isObj(raw.artwork)) {
        const art = raw.artwork;
        if (art.kind === 'image') {
            const src = str(art.src).trim();
            const bytes = Math.floor((src.length - src.indexOf(',') - 1) * 0.75);
            if (!IMAGE_DATA_URL.test(src)) {
                warnings.push('Preprinted artwork dropped — only embedded image data is allowed');
            } else if (bytes > PAPER_FILE_LIMITS.maxArtworkBytes) {
                warnings.push(`Preprinted artwork dropped — ${Math.round(bytes / 1024)} KB exceeds the limit`);
            } else {
                out.artwork = { kind: 'image', src };
            }
        } else if (art.kind === 'svg') {
            const svg = str(art.svg);
            if (svg.length > PAPER_FILE_LIMITS.maxArtworkBytes) {
                warnings.push('Preprinted artwork dropped — too large');
            } else if (/<\s*script|javascript:|\bon[a-z]+\s*=/i.test(svg)) {
                // The renderer's SVG import does the real sanitising; this is a
                // blunt refusal so obviously-active content never even reaches
                // storage, let alone a DOM.
                warnings.push('Preprinted artwork dropped — it contained active content');
            } else {
                out.artwork = { kind: 'svg', svg };
            }
        }
    }

    return Object.keys(out).length ? out : undefined;
}

function parseDensityHint(raw: unknown): PaperProfile['densityHint'] {
    if (!isObj(raw)) return undefined;
    const out: NonNullable<PaperProfile['densityHint']> = {};
    const min = num(raw.min);
    const max = num(raw.max);
    const def = num(raw.default);
    if (min !== undefined) out.min = min;
    if (max !== undefined) out.max = max;
    if (def !== undefined) out.default = def;
    return Object.keys(out).length ? out : undefined;
}
