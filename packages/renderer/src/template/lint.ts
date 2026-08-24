/**
 * The adaptivity safety net.
 *
 * "Always adaptive" is only trustworthy if a template that looks right at the
 * author's size can't silently fall apart at another. This module resolves a
 * template across a *matrix* of label sizes — the authoring size, the common
 * built-in media, and the declared range extremes — and aggregates any
 * overflow/clipping/empty findings, each tagged with the size that failed. The
 * editor surfaces these as a live preview gallery, and publishing is gated on a
 * clean (error-free) report.
 */

import { PX_PER_MM } from '../model/design';
import { DEFAULT_PAPER_PROFILES } from 'universal-label-core';
import type { MeasureTextFn } from '../raster/measure';
import { resolveTemplate, type LabelTemplate, type ResolveIssue, type ResolveResult } from './template';

export interface TestSize {
    label: string;
    tapeWidthMm: number;
    labelLengthMm: number;
    widthPx: number;
    heightPx: number;
}

export interface LintFinding extends ResolveIssue {
    atSize: TestSize;
}

export interface LintReport {
    findings: LintFinding[];
    sizesTested: TestSize[];
    /** True when no error-severity finding occurred at any tested size. */
    ok: boolean;
}

const FALLBACK_LENGTH_MM = 40;

function px(mm: number): number {
    return Math.max(8, Math.round(mm * PX_PER_MM));
}

function makeSize(label: string, tapeWidthMm: number, labelLengthMm: number): TestSize {
    return { label, tapeWidthMm, labelLengthMm, widthPx: px(labelLengthMm), heightPx: px(tapeWidthMm) };
}

/**
 * The set of label sizes a template is checked against: its authoring size, the
 * built-in media profiles, and the declared min/max range corners (if any),
 * deduped by physical dimensions.
 */
export function sizeMatrix(tpl: LabelTemplate): TestSize[] {
    const a = tpl.adaptivity;
    const designLen = a.designedFor.labelLengthMm ?? FALLBACK_LENGTH_MM;
    const sizes: TestSize[] = [makeSize('Designed size', a.designedFor.tapeWidthMm, designLen)];

    for (const p of DEFAULT_PAPER_PROFILES) {
        sizes.push(makeSize(p.name, p.tapeWidthMm, p.labelLengthMm ?? designLen));
    }

    // Declared range corners — the author's own promise about where it works.
    const minW = a.minTapeWidthMm, maxW = a.maxTapeWidthMm;
    const minL = a.minLabelLengthMm, maxL = a.maxLabelLengthMm;
    if (minW !== undefined) sizes.push(makeSize('Min tape width', minW, minL ?? designLen));
    if (maxW !== undefined) sizes.push(makeSize('Max tape width', maxW, maxL ?? designLen));
    if (minL !== undefined) sizes.push(makeSize('Min length', minW ?? a.designedFor.tapeWidthMm, minL));
    if (maxL !== undefined) sizes.push(makeSize('Max length', maxW ?? a.designedFor.tapeWidthMm, maxL));

    // Dedupe by physical dimensions (keep the first, more descriptive label).
    const seen = new Set<string>();
    return sizes.filter(s => {
        const key = `${s.tapeWidthMm}x${s.labelLengthMm}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/** Resolve a template at every size in the matrix (for the preview gallery). */
export function resolveAcrossSizes(
    tpl: LabelTemplate,
    params?: Record<string, unknown>,
    measureText?: MeasureTextFn,
    sizes: TestSize[] = sizeMatrix(tpl)
): Array<{ size: TestSize; result: ResolveResult }> {
    return sizes.map(size => ({
        size,
        result: resolveTemplate(tpl, {
            widthPx: size.widthPx, heightPx: size.heightPx,
            tapeWidthMm: size.tapeWidthMm, labelLengthMm: size.labelLengthMm,
            params, measureText
        })
    }));
}

/**
 * Full multi-size lint. Aggregates the per-size resolve issues into one report;
 * `ok` is false if any size produced an error-severity issue.
 */
export function validateAcrossSizes(
    tpl: LabelTemplate,
    params?: Record<string, unknown>,
    measureText?: MeasureTextFn,
    sizes: TestSize[] = sizeMatrix(tpl)
): LintReport {
    const findings: LintFinding[] = [];
    for (const { size, result } of resolveAcrossSizes(tpl, params, measureText, sizes)) {
        for (const issue of result.issues) findings.push({ ...issue, atSize: size });
    }
    return { findings, sizesTested: sizes, ok: !findings.some(f => f.severity === 'error') };
}

// ---- media compatibility ------------------------------------------------

export type MediaFit = 'designed' | 'supported' | 'outside';

/**
 * Whether a template is meant for the label currently loaded.
 *
 * The most useful question when browsing a library is "does this work with the
 * tape I have in the machine", and it is answerable without rendering anything:
 * the author already declared a designed size and, optionally, the range they
 * stand behind. Three outcomes rather than a boolean, because "this is exactly
 * what it was drawn for" and "this is inside the range the author claims" are
 * genuinely different levels of confidence and worth showing differently.
 *
 * A missing bound means unbounded on that side — an author who declares no
 * maximum is saying they expect it to keep working, and the adaptivity lint is
 * what actually holds them to it.
 */
export function mediaFit(tpl: LabelTemplate, tapeWidthMm: number, labelLengthMm?: number): MediaFit {
    const a = tpl.adaptivity;
    const d = a.designedFor;

    const sameWidth = Math.abs(d.tapeWidthMm - tapeWidthMm) < 0.5;
    const sameLength = labelLengthMm === undefined
        || d.labelLengthMm === undefined
        || Math.abs(d.labelLengthMm - labelLengthMm) < 0.5;
    if (sameWidth && sameLength) return 'designed';

    const within = (v: number | undefined, lo: number | undefined, hi: number | undefined): boolean => {
        if (v === undefined) return true;
        if (lo !== undefined && v < lo - 0.5) return false;
        if (hi !== undefined && v > hi + 0.5) return false;
        return true;
    };
    // Auto-length templates size themselves to their content, so the label's
    // own length simply does not constrain them.
    const lengthToCheck = a.autoLength === true ? undefined : labelLengthMm;
    const ok = within(tapeWidthMm, a.minTapeWidthMm, a.maxTapeWidthMm)
        && within(lengthToCheck, a.minLabelLengthMm, a.maxLabelLengthMm);
    return ok ? 'supported' : 'outside';
}

export type ResolutionFit = 'exact' | 'renders' | 'outside';

/** The printer + paper a template is being judged against, in dots. */
export interface ResolutionContext {
    /** Device resolution, from PrinterCapabilities.dpmm. */
    dpmm: number;
    /** Printhead height in dots — the canvas cannot exceed it. */
    printheadPx: number;
    tapeWidthMm: number;
    /** Absent on continuous tape, where length is whatever the content needs. */
    labelLengthMm?: number;
}

/**
 * Whether a template was drawn for the *dots* this printer and paper produce.
 *
 * Distinct from {@link mediaFit}, which compares millimetres. Two printers can
 * agree on 12 mm tape and still disagree completely about what that is: a 203
 * dpi head gives 96 dots across it, a 300 dpi head gives 142. A template drawn
 * for one lands on half-pixel boundaries on the other, and everything that has
 * to stay on the dot grid — bitmap glyphs, barcode modules, QR cells — turns to
 * fuzz. Millimetres cannot see that; this can.
 *
 * 'exact' means the canvas this template was authored on is the canvas it will
 * print on, dot for dot. 'renders' means it is adaptive enough to resolve here
 * without overflowing or clipping, which is a weaker but honest claim. Callers
 * that want the strict reading are asking a real question — "show me only what
 * was made for my machine" — and it is not the same question as "will it work".
 */
export function resolutionFit(
    tpl: LabelTemplate,
    ctx: ResolutionContext,
    measureText?: MeasureTextFn
): ResolutionFit {
    const target = canvasFor(ctx.tapeWidthMm, ctx.labelLengthMm, ctx);
    const df = tpl.adaptivity.designedFor;

    // An author who recorded no dpmm has told us nothing about dots, so 'exact'
    // is not available to them — claiming it would mean reading a millimetre
    // match as a resolution match, which is exactly the confusion this function
    // exists to remove.
    if (df.dpmm !== undefined && Math.abs(df.dpmm - ctx.dpmm) < 0.05) {
        const designed = canvasFor(df.tapeWidthMm, df.labelLengthMm, ctx);
        // Auto-length templates set their own length from content, so only the
        // across-the-tape dimension is a claim about dots.
        const lengthMatters = tpl.adaptivity.autoLength !== true
            && df.labelLengthMm !== undefined
            && ctx.labelLengthMm !== undefined;
        if (designed.heightPx === target.heightPx && (!lengthMatters || designed.widthPx === target.widthPx)) {
            return 'exact';
        }
    }

    // Not authored here — so ask whether it survives the trip. A template that
    // resolves with no issues at this canvas is usable even though it was drawn
    // for another machine.
    try {
        const { issues } = resolveTemplate(tpl, {
            widthPx: target.widthPx,
            heightPx: target.heightPx,
            tapeWidthMm: ctx.tapeWidthMm,
            labelLengthMm: ctx.labelLengthMm,
            measureText
        });
        return issues.length === 0 ? 'renders' : 'outside';
    } catch {
        // A template that cannot be resolved at all certainly does not fit.
        return 'outside';
    }
}

/**
 * The dot canvas a given media size produces on this device.
 *
 * Clamped to the printhead, because a 15 mm tape on a 12 mm head still only
 * prints 96 dots — the extra millimetres are unreachable, and a canvas that
 * claimed them would put content past the edge of what the machine can mark.
 */
function canvasFor(
    tapeWidthMm: number,
    labelLengthMm: number | undefined,
    ctx: ResolutionContext
): { widthPx: number; heightPx: number } {
    return {
        heightPx: Math.max(8, Math.min(ctx.printheadPx, Math.round(tapeWidthMm * ctx.dpmm))),
        widthPx: Math.max(8, Math.round((labelLengthMm ?? 40) * ctx.dpmm))
    };
}
