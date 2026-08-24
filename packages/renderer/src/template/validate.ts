/**
 * The template import gate.
 *
 * `parseTemplate` takes arbitrary untrusted JSON and either rejects it or
 * returns a *normalised* {@link LabelTemplate} rebuilt field-by-field from
 * validated pieces — so unknown/extra properties are dropped rather than
 * trusted, every expression AST is checked with {@link validateAst}/
 * {@link validateTextBinding}, and hard size caps bound element/param counts,
 * string lengths, embedded-image bytes, and total expression size.
 *
 * A template that passes this gate is safe to resolve and render without
 * executing untrusted code.
 */

import { validateTextBinding, type TextBinding } from './expr';
import { validatePlacement, validateDim, type Dim, type Placement } from './dim';
import { validateConstraint, type Constraint } from './constraints';
import { countNodes } from './safe-expr';
import type {
    LabelTemplate, TemplateElement, TemplateParam, TemplateAdaptivity, ParamType, TemplateLicense
} from './template';
import { TEMPLATE_LICENSES, TAG_LIMITS } from './template';
import type { DitherMode, LinearSymbology, ShapeKind, SymbolPath } from '../model/design';
import type { InkSlot } from 'universal-label-core';
import { IMAGE_LIMITS, type TemplateGallery, type TemplateImage } from './template';
import { LINEAR_SYMBOLOGIES } from '../model/design';
import { isValidPath, PATH_LIMITS } from '../raster/svgpath';
import { isWebFontId } from '../raster/fonts/webfonts';

export interface ParseOk { ok: true; template: LabelTemplate; warnings: string[]; }
export interface ParseErr { ok: false; errors: string[]; }
export type ParseResult = ParseOk | ParseErr;

export const CAPS = {
    maxElements: 200,
    maxParams: 60,
    maxString: 10_000,
    maxName: 200,
    maxImageBytes: 512 * 1024,
    maxTotalExprNodes: 20_000,
    /** Ink slots per template. Real hardware tops out far below this. */
    maxSlots: 8
};

const ELEMENT_TYPES = new Set(['text', 'barcode', 'qr', 'datamatrix', 'image', 'shape', 'symbol']);
const SHAPE_KINDS = new Set<ShapeKind>(['line', 'rect', 'ellipse']);
const SYMBOLOGIES = new Set<LinearSymbology>(LINEAR_SYMBOLOGIES);
const PARAM_TYPES = new Set<ParamType>(['text', 'number', 'boolean', 'select', 'color', 'date']);
const LICENSES = new Set<TemplateLicense>(TEMPLATE_LICENSES);
const DITHER_MODES = new Set<DitherMode>(['threshold', 'bayer', 'floyd-steinberg']);
const ALIGNS = new Set(['left', 'center', 'right']);
const VALIGNS = new Set(['top', 'middle', 'bottom']);
const FONTS = new Set(['bitmap', 'vector']);
const EC_LEVELS = new Set(['L', 'M', 'Q', 'H']);
const IDENT = /^[A-Za-z_$][\w$]*$/;
const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

type Obj = Record<string, unknown>;
function isObj(v: unknown): v is Obj { return typeof v === 'object' && v !== null && !Array.isArray(v); }
function str(v: unknown, fallback = ''): string { return typeof v === 'string' ? v : fallback; }
function bool(v: unknown, fallback = false): boolean { return typeof v === 'boolean' ? v : fallback; }
function numOr(v: unknown, fallback: number): number { return typeof v === 'number' && Number.isFinite(v) ? v : fallback; }

/** Validate + normalise untrusted JSON into a safe LabelTemplate. */
export function parseTemplate(input: unknown): ParseResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!isObj(input)) return { ok: false, errors: ['Not a template object'] };
    if (input.kind !== 'label-template') return { ok: false, errors: ['Not a label template (bad "kind")'] };
    if (input.version !== 1) {
        return { ok: false, errors: [`Unsupported template version ${String(input.version)}`] };
    }

    const rawElements = Array.isArray(input.elements) ? input.elements : [];
    const rawParams = Array.isArray(input.params) ? input.params : [];
    if (rawElements.length > CAPS.maxElements) errors.push(`Too many elements (${rawElements.length} > ${CAPS.maxElements})`);
    if (rawParams.length > CAPS.maxParams) errors.push(`Too many parameters (${rawParams.length} > ${CAPS.maxParams})`);

    const params: TemplateParam[] = [];
    rawParams.slice(0, CAPS.maxParams).forEach((p, i) => {
        const parsed = parseParam(p, i, errors);
        if (parsed) params.push(parsed);
    });

    let exprBudget = CAPS.maxTotalExprNodes;
    const spend = (b: TextBinding | Placement | undefined): void => {
        if (b !== undefined) exprBudget -= countNodes(b);
    };

    const elements: TemplateElement[] = [];
    rawElements.slice(0, CAPS.maxElements).forEach((e, i) => {
        const parsed = parseElement(e, i, errors);
        if (parsed) {
            elements.push(parsed);
            spend(parsed.place);
            if ('text' in parsed) spend(parsed.text);
            if ('data' in parsed) spend(parsed.data);
        }
    });
    if (exprBudget < 0) errors.push('Total expression complexity exceeds the allowed budget');

    const adaptivity = parseAdaptivity(input.adaptivity, errors);

    // Constraints: same strict gate — ids/anchors/axis checked, distance is a Dim.
    const rawConstraints = Array.isArray(input.constraints) ? input.constraints : [];
    if (rawConstraints.length > CAPS.maxElements * 4) errors.push('Too many constraints');
    const elementIds = new Set(elements.map(e => e.id));
    const constraints: Constraint[] = [];
    for (const raw of rawConstraints.slice(0, CAPS.maxElements * 4)) {
        const errs = validateConstraint(raw, d => validateDim(d));
        if (errs.length) { errors.push(...errs.map(e => `Constraint: ${e}`)); continue; }
        const c = raw as Constraint;
        // Drop constraints that reference elements which didn't survive parsing.
        if (!elementIds.has(c.from.element)) continue;
        if (c.to.element !== undefined && !elementIds.has(c.to.element)) continue;
        constraints.push({
            id: c.id, axis: c.axis,
            from: { element: c.from.element, point: c.from.point },
            to: c.to.element !== undefined ? { element: c.to.element, point: c.to.point } : { point: c.to.point },
            distance: c.distance
        });
    }

    if (errors.length > 0) return { ok: false, errors };

    // An unrecognised licence is dropped rather than guessed at: claiming terms
    // the author didn't choose is worse than showing none.
    let license: TemplateLicense | undefined;
    if (input.license !== undefined) {
        if (LICENSES.has(str(input.license) as TemplateLicense)) license = str(input.license) as TemplateLicense;
        else warnings.push(`Unrecognised licence "${clip(str(input.license), 60)}" — dropped`);
    }
    const tags = parseTags(input.tags);
    const slots = parseSlots(input.slots, warnings);
    const gallery = parseGallery(input.gallery, warnings);

    const template: LabelTemplate = {
        version: 1,
        kind: 'label-template',
        id: str(input.id) || cryptoId(),
        name: clip(str(input.name, 'Untitled template'), CAPS.maxName),
        author: input.author !== undefined ? clip(str(input.author), CAPS.maxName) : undefined,
        description: input.description !== undefined ? clip(str(input.description), CAPS.maxString) : undefined,
        license,
        tags: tags.length ? tags : undefined,
        revision: input.revision !== undefined ? clampInt(numOr(input.revision, 1), 1, 1_000_000) : undefined,
        params,
        elements,
        constraints: constraints.length ? constraints : undefined,
        adaptivity,
        slots: slots.length ? slots : undefined,
        gallery,
        threshold: clampInt(numOr(input.threshold, 128), 1, 254)
    };
    return { ok: true, template, warnings };
}

/**
 * Photographs from an untrusted document.
 *
 * Three things are enforced rather than trusted, because a template is opened
 * by whoever downloads it:
 *
 * - **`data:` URLs only.** A remote `src` would make opening someone's template
 *   a request to their server — an unasked-for callback identifying the viewer.
 *   Same reason `javascript:` is not merely filtered but the whole scheme is
 *   whitelisted instead.
 * - **A real image type.** `data:text/html` in an `<img>` is inert in practice,
 *   but a whitelist is cheaper to be sure about than a blacklist.
 * - **A size bound.** The library shares one storage key; one oversized photo
 *   would break saving for every label the user has.
 */
const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/;

function parseImage(raw: unknown, where: string, warnings: string[]): TemplateImage | undefined {
    if (!isObj(raw)) return undefined;
    const src = str(raw.src).trim();
    if (!IMAGE_DATA_URL.test(src)) {
        warnings.push(`${where}: image dropped — only embedded image data is allowed`);
        return undefined;
    }
    // base64 carries 3 bytes per 4 characters; near enough for a cap.
    const bytes = Math.floor((src.length - src.indexOf(',') - 1) * 0.75);
    if (bytes > IMAGE_LIMITS.maxBytes) {
        warnings.push(`${where}: image dropped — ${Math.round(bytes / 1024)} KB exceeds the ${Math.round(IMAGE_LIMITS.maxBytes / 1024)} KB limit`);
        return undefined;
    }
    const alt = clip(str(raw.alt), IMAGE_LIMITS.maxAlt).trim();
    const image: TemplateImage = { src, alt };
    if (raw.credit !== undefined) image.credit = clip(str(raw.credit), CAPS.maxName);
    return image;
}

function parseGallery(raw: unknown, warnings: string[]): TemplateGallery | undefined {
    if (!isObj(raw)) return undefined;
    const cover = parseImage(raw.cover, 'Cover', warnings);
    const shots: TemplateImage[] = [];
    if (Array.isArray(raw.shots)) {
        for (const [i, s] of raw.shots.slice(0, IMAGE_LIMITS.maxShots).entries()) {
            const img = parseImage(s, `Photo ${i + 1}`, warnings);
            if (img) shots.push(img);
        }
        if (raw.shots.length > IMAGE_LIMITS.maxShots) {
            warnings.push(`Only the first ${IMAGE_LIMITS.maxShots} photos were kept`);
        }
    }
    if (!cover && shots.length === 0) return undefined;
    return { ...(cover ? { cover } : {}), ...(shots.length ? { shots } : {}) };
}

/**
 * Ink slots from an untrusted document.
 *
 * Warn-and-drop rather than reject: a slot with a malformed colour is a
 * cosmetic defect in someone else's file, and refusing to open the whole
 * template over it would be a poor trade. A slot that survives is fully
 * well-formed, so nothing downstream has to re-check it.
 */
function parseSlots(raw: unknown, warnings: string[]): InkSlot[] {
    if (!Array.isArray(raw)) return [];
    const out: InkSlot[] = [];
    const seen = new Set<string>();
    for (const entry of raw.slice(0, CAPS.maxSlots)) {
        if (!isObj(entry)) continue;
        const id = str(entry.id);
        if (!IDENT.test(id)) { warnings.push(`Ink slot "${clip(id, 40)}" — invalid id, dropped`); continue; }
        if (seen.has(id)) { warnings.push(`Ink slot "${id}" declared twice — later one dropped`); continue; }
        seen.add(id);

        const slot: InkSlot = { id };
        if (entry.name !== undefined) slot.name = clip(str(entry.name), CAPS.maxName);
        if (entry.intent !== undefined) {
            const intent = str(entry.intent).trim();
            if (HEX_COLOR.test(intent)) slot.intent = intent;
            else warnings.push(`Ink slot "${id}" — unusable colour "${clip(intent, 20)}", dropped`);
        }
        if (entry.onUnavailable === 'drop' || entry.onUnavailable === 'merge') {
            slot.onUnavailable = entry.onUnavailable;
        }
        out.push(slot);
    }
    if (Array.isArray(raw) && raw.length > CAPS.maxSlots) {
        warnings.push(`Too many ink slots (${raw.length} > ${CAPS.maxSlots}) — extras dropped`);
    }
    return out;
}

function parseParam(raw: unknown, i: number, errors: string[]): TemplateParam | null {
    if (!isObj(raw)) { errors.push(`Parameter ${i}: not an object`); return null; }
    const name = str(raw.name);
    if (!IDENT.test(name)) { errors.push(`Parameter ${i}: invalid name "${name}"`); return null; }
    const type = raw.type as ParamType;
    if (!PARAM_TYPES.has(type)) { errors.push(`Parameter "${name}": bad type`); return null; }
    const param: TemplateParam = {
        name,
        label: clip(str(raw.label, name), CAPS.maxName),
        type,
        default: normalizeParamDefault(type, raw.default)
    };
    if (type === 'number') {
        if (raw.min !== undefined) param.min = numOr(raw.min, 0);
        if (raw.max !== undefined) param.max = numOr(raw.max, 0);
        if (raw.step !== undefined) param.step = numOr(raw.step, 1);
    }
    if (type === 'select') {
        param.options = (Array.isArray(raw.options) ? raw.options : []).map(o => clip(str(o), CAPS.maxName)).slice(0, 200);
    }
    if (type === 'text') param.multiline = bool(raw.multiline);
    if (raw.help !== undefined) param.help = clip(str(raw.help), CAPS.maxString);
    return param;
}

function normalizeParamDefault(type: ParamType, v: unknown): string | number | boolean {
    if (type === 'number') return numOr(v, 0);
    if (type === 'boolean') return bool(v);
    return clip(str(v), CAPS.maxString);
}

function parseElement(raw: unknown, i: number, errors: string[]): TemplateElement | null {
    if (!isObj(raw)) { errors.push(`Element ${i}: not an object`); return null; }
    const type = raw.type;
    if (typeof type !== 'string' || !ELEMENT_TYPES.has(type)) { errors.push(`Element ${i}: bad type "${String(type)}"`); return null; }
    const id = str(raw.id) || cryptoId();

    const placeErrors = validatePlacement(raw.place);
    if (placeErrors.length) { errors.push(`Element ${id}: ${placeErrors.join('; ')}`); return null; }
    const place = raw.place as Placement;
    const locked = raw.locked === true ? true : undefined;
    // Per-axis freezes travel with the element, same as the whole-element lock.
    const carried = {
        locked,
        lockX: raw.lockX === true ? true : undefined,
        lockY: raw.lockY === true ? true : undefined,
        // The slot id travels even if the template declares no such slot: the
        // planner treats an undeclared slot as a bare one rather than losing the
        // element, and silently rewriting it to primary here would throw away
        // the author's intent on the way in.
        ink: IDENT.test(str(raw.ink)) ? str(raw.ink) : undefined,
        // Clamped to the usable range rather than rejected: 0 or 255 would make
        // the element a solid block, which is a mistake in someone else's file
        // and not a reason to refuse the whole template.
        monoThreshold: raw.monoThreshold !== undefined
            ? clampInt(numOr(raw.monoThreshold, 128), 1, 254)
            : undefined
    };
    const rotation = typeof raw.rotation === 'number' && Number.isFinite(raw.rotation)
        ? ((Math.round(raw.rotation) % 360) + 360) % 360 || undefined
        : undefined;

    const checkBinding = (field: string, v: unknown): TextBinding | null => {
        const e = validateTextBinding(v);
        if (e.length) { errors.push(`Element ${id}.${field}: ${e.join('; ')}`); return null; }
        return v as TextBinding;
    };

    switch (type) {
        case 'text': {
            const text = checkBinding('text', raw.text ?? '');
            if (text === null) return null;
            return {
                type: 'text', id, place, ...carried, rotation, text,
                font: FONTS.has(str(raw.font)) ? (str(raw.font) as 'bitmap' | 'vector') : 'bitmap',
                bitmapFont: clip(str(raw.bitmapFont, 'fixed'), CAPS.maxName),
                fontFamily: clip(str(raw.fontFamily, 'sans-serif'), CAPS.maxName),
                // An unknown id means a font this build cannot supply, so it is
                // dropped to the local family rather than silently mis-rendered.
                webFont: isWebFontId(raw.webFont) ? raw.webFont : undefined,
                bold: bool(raw.bold), italic: bool(raw.italic), underline: bool(raw.underline),
                align: ALIGNS.has(str(raw.align)) ? (str(raw.align) as 'left' | 'center' | 'right') : 'left',
                autofit: bool(raw.autofit),
                wrap: raw.wrap === true ? true : undefined,
                invert: raw.invert === true ? true : undefined,
                valign: VALIGNS.has(str(raw.valign)) ? (str(raw.valign) as 'top' | 'middle' | 'bottom') : undefined,
                invertPad: raw.invertPad !== undefined ? clampInt(numOr(raw.invertPad, 4), 0, 64) : undefined
            };
        }
        case 'barcode': {
            const data = checkBinding('data', raw.data ?? '');
            if (data === null) return null;
            return {
                type: 'barcode', id, place, ...carried, rotation, data,
                showText: bool(raw.showText, true),
                symbology: SYMBOLOGIES.has(str(raw.symbology) as LinearSymbology)
                    ? (str(raw.symbology) as LinearSymbology) : undefined
            };
        }
        case 'qr': {
            const data = checkBinding('data', raw.data ?? '');
            if (data === null) return null;
            return { type: 'qr', id, place, ...carried, rotation, data, ecLevel: EC_LEVELS.has(str(raw.ecLevel)) ? (str(raw.ecLevel) as 'L' | 'M' | 'Q' | 'H') : 'M' };
        }
        case 'datamatrix': {
            const data = checkBinding('data', raw.data ?? '');
            if (data === null) return null;
            return { type: 'datamatrix', id, place, ...carried, rotation, data };
        }
        case 'shape': {
            const kind = str(raw.shape) as ShapeKind;
            // The radius is a Dim so it can track the label's own corner.
            let radius: Dim | null = null;
            if (raw.radius !== undefined) {
                const errs = validateDim(raw.radius);
                if (errs.length) { errors.push(`Element ${id}.radius: ${errs.join('; ')}`); return null; }
                radius = raw.radius as Dim;
            }
            return {
                type: 'shape', id, place, ...carried, rotation,
                shape: SHAPE_KINDS.has(kind) ? kind : 'rect',
                stroke: clampInt(numOr(raw.stroke, 2), 0, 200),
                fill: bool(raw.fill),
                radius: radius ?? undefined,
                dash: raw.dash !== undefined ? clampInt(numOr(raw.dash, 0), 0, 400) : undefined
            };
        }
        case 'symbol': {
            const name = checkBinding('name', raw.name ?? 'warning');
            if (name === null) return null;
            // Custom artwork is accepted only as geometry, and only if it
            // actually parses — the same "validate, never execute" gate the
            // expression ASTs go through.
            let path: SymbolPath | undefined;
            if (raw.path !== undefined) {
                if (!isObj(raw.path)) { errors.push(`Element ${id}: symbol path must be an object`); return null; }
                const d = str(raw.path.d);
                if (d.length > PATH_LIMITS.maxLength) { errors.push(`Element ${id}: symbol path too large`); return null; }
                if (!isValidPath(d)) { errors.push(`Element ${id}: symbol path data is not valid`); return null; }
                const vb = Array.isArray(raw.path.viewBox) ? raw.path.viewBox.map(v => numOr(v, 0)) : [];
                if (vb.length !== 4 || vb[2] <= 0 || vb[3] <= 0) {
                    errors.push(`Element ${id}: symbol viewBox must be [x, y, width, height]`); return null;
                }
                path = {
                    d,
                    viewBox: [vb[0], vb[1], vb[2], vb[3]],
                    fillRule: raw.path.fillRule === 'evenodd' ? 'evenodd' : 'nonzero',
                    label: raw.path.label !== undefined ? clip(str(raw.path.label), CAPS.maxName) : undefined
                };
            }
            return { type: 'symbol', id, place, ...carried, rotation, name, path };
        }
        case 'image': {
            const src = checkBinding('src', raw.src ?? '');
            if (src === null) return null;
            // Reject oversized embedded data URLs (bytes, not chars).
            if (typeof src === 'string' && src.startsWith('data:') && src.length > CAPS.maxImageBytes) {
                errors.push(`Element ${id}: embedded image too large`); return null;
            }
            return {
                type: 'image', id, place, ...carried, rotation, src,
                mode: DITHER_MODES.has(str(raw.mode) as DitherMode) ? (str(raw.mode) as DitherMode) : 'floyd-steinberg',
                threshold: clampInt(numOr(raw.threshold, 128), 0, 255),
                invert: bool(raw.invert)
            };
        }
    }
    return null;
}

function parseAdaptivity(raw: unknown, errors: string[]): TemplateAdaptivity {
    const a = isObj(raw) ? raw : {};
    const df = isObj(a.designedFor) ? a.designedFor : {};
    const tapeWidthMm = numOr(df.tapeWidthMm, 12);
    if (tapeWidthMm <= 0 || tapeWidthMm > 300) errors.push('adaptivity.designedFor.tapeWidthMm out of range');
    const out: TemplateAdaptivity = {
        designedFor: {
            tapeWidthMm,
            labelLengthMm: df.labelLengthMm !== undefined ? numOr(df.labelLengthMm, 40) : undefined,
            // Clamped rather than rejected: an implausible dpmm is a bad claim
            // about someone else's hardware, not a reason to refuse the file.
            // 4-40 dpmm spans roughly 100 to 1000 dpi.
            dpmm: df.dpmm !== undefined ? clampNum(numOr(df.dpmm, 8), 4, 40) : undefined
        }
    };
    for (const k of ['minTapeWidthMm', 'maxTapeWidthMm', 'minLabelLengthMm', 'maxLabelLengthMm'] as const) {
        if (a[k] !== undefined) out[k] = numOr(a[k], 0);
    }
    if (a.autoLength === true) out.autoLength = true;
    if (a.relativeTo === 'media') out.relativeTo = 'media';
    if (a.autoLengthPadMm !== undefined) out.autoLengthPadMm = Math.max(0, Math.min(50, numOr(a.autoLengthPadMm, 2)));
    return out;
}

/**
 * Normalise browse tags so "Kitchen", "kitchen " and "KITCHEN" are one tag.
 *
 * Unicode letters and numbers are kept (tags are user-facing vocabulary and
 * this project will not stay English-only), everything else collapses to a
 * single space, and the result is lowercased, deduped and capped. Anything
 * that normalises to nothing is dropped rather than stored as an empty tag.
 */
/**
 * One tag, reduced to its storable form: lowercase, punctuation collapsed to
 * single spaces, trimmed and clipped.
 *
 * Exported because the editor has to apply exactly this before showing a chip.
 * If the UI kept "Kitchen — Spices!" while the store kept "kitchen spices",
 * typing the tag you can see into the search box would find nothing.
 */
export function normalizeTag(raw: unknown): string {
    return clip(
        str(raw).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase(),
        TAG_LIMITS.maxTagLength
    ).trim();
}

export function parseTags(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const entry of raw.slice(0, TAG_LIMITS.maxTags * 4)) {
        const tag = normalizeTag(entry);
        if (tag === '' || seen.has(tag)) continue;
        seen.add(tag);
        out.push(tag);
        if (out.length >= TAG_LIMITS.maxTags) break;
    }
    return out;
}

function clip(s: string, max: number): string { return s.length > max ? s.slice(0, max) : s; }
function clampInt(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, Math.round(v))); }
function clampNum(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
function cryptoId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Serialise a template to compact, portable JSON. */
export function serializeTemplate(tpl: LabelTemplate): string {
    return JSON.stringify(tpl);
}

/** Parse JSON text through the import gate. */
export function parseTemplateJSON(text: string): ParseResult {
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        return { ok: false, errors: ['Invalid JSON'] };
    }
    return parseTemplate(data);
}
