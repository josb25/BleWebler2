/**
 * TemplateSession — the reactive owner of the template experience, a sibling of
 * {@link EditorStore}. It holds the saved-template library, the currently open
 * template plus its parameter values, and derives (a) the resolved LabelDesign
 * for the live preview and (b) the multi-size lint report. Like the rest of the
 * UI it is framework-boundary-clean: it never touches the printer directly.
 */

import { PX_PER_MM, type LabelDesign } from 'universal-label-renderer';
import {
    resolveTemplate, templateFromDesign,
    type LabelTemplate, type ResolveResult
} from 'universal-label-renderer';
import { validateAcrossSizes, type LintReport } from 'universal-label-renderer';
import { serializeTemplate, type ParseResult } from 'universal-label-renderer';
import { LabelLibrary, type DesignOrigin, type SavedLabel } from 'universal-label-renderer';
import { STARTER_TEMPLATES } from 'universal-label-renderer';
import type { MeasureTextFn } from 'universal-label-renderer';

/** A shared canvas-backed text measurer for accurate vector width / auto-fit. */
function makeBrowserMeasure(): MeasureTextFn | undefined {
    if (typeof document === 'undefined') return undefined;
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return undefined;
    return (text, font) => { ctx.font = font; return ctx.measureText(text).width; };
}

export class TemplateSession {
    private library: LabelLibrary;
    private starterIds = new Set(STARTER_TEMPLATES.map(template => template.id));
    private measure = makeBrowserMeasure();
    /** Bumped on any library mutation so list() stays reactive. */
    private version = $state(0);

    /** The template currently being filled/authored (null on the browse screen). */
    active = $state<LabelTemplate | null>(null);
    /** Parameter values for the active template. */
    params = $state<Record<string, unknown>>({});
    /** Preview target size (mm) — editable so authors can probe other sizes. */
    tapeWidthMm = $state(12);
    labelLengthMm = $state(40);
    /** Last import error message, surfaced in the UI. */
    importError = $state<string | null>(null);

    constructor(library: LabelLibrary = new LabelLibrary()) {
        this.library = library;
        this.library.installDefaults(STARTER_TEMPLATES);
    }

    list(): SavedLabel[] {
        void this.version;
        // Older installations predate persisted origins. Infer only the bundled
        // starter ids here so the catalogue can present one source-aware list
        // today and append a community source later without changing documents.
        return this.library.list().map(entry => ({
            ...entry,
            origin: entry.origin ?? (this.starterIds.has(entry.template.id)
                ? { kind: 'bundled' as const, collection: 'starter' }
                : { kind: 'local' as const })
        }));
    }

    get targetHeightPx(): number { return Math.max(8, Math.round(this.tapeWidthMm * PX_PER_MM)); }
    get targetWidthPx(): number { return Math.max(8, Math.round(this.labelLengthMm * PX_PER_MM)); }

    /** The resolved, printable design for the current params + preview size. */
    readonly resolved = $derived.by<ResolveResult | null>(() => {
        if (!this.active) return null;
        return resolveTemplate(this.active, {
            widthPx: this.targetWidthPx, heightPx: this.targetHeightPx,
            tapeWidthMm: this.tapeWidthMm, labelLengthMm: this.labelLengthMm,
            params: this.params, measureText: this.measure
        });
    });

    /** The adaptivity safety-net report across the size matrix. */
    readonly lint = $derived.by<LintReport | null>(() =>
        this.active ? validateAcrossSizes(this.active, this.params, this.measure) : null
    );

    open(tpl: LabelTemplate): void {
        this.active = tpl;
        const p: Record<string, unknown> = {};
        for (const param of tpl.params) p[param.name] = param.default;
        this.params = p;
        this.tapeWidthMm = tpl.adaptivity.designedFor.tapeWidthMm;
        this.labelLengthMm = tpl.adaptivity.designedFor.labelLengthMm ?? 40;
        this.importError = null;
    }

    close(): void { this.active = null; }

    setParam(name: string, value: unknown): void {
        this.params = { ...this.params, [name]: value };
    }

    /** Produce a resolved LabelDesign to hand to the editor / printer. */
    resolveToDesign(): LabelDesign | null {
        return this.resolved?.design ?? null;
    }

    // ---- library operations ----

    saveTemplate(tpl: LabelTemplate, origin?: DesignOrigin): void {
        this.library.save(tpl, undefined, undefined, origin);
        this.version++;
    }

    /** Author a template from an existing design (adaptive by default). */
    saveFromDesign(design: LabelDesign, adaptive = true): LabelTemplate {
        const tpl = templateFromDesign(design, { adaptive });
        this.library.save(tpl);
        this.version++;
        return tpl;
    }

    remove(id: string): void { this.library.remove(id); this.version++; }
    toggleFavorite(id: string): void { this.library.toggleFavorite(id); this.version++; }

    importJSON(text: string): ParseResult {
        const res = this.library.import(text);
        if (res.ok) { this.version++; this.importError = null; }
        else this.importError = res.errors.join('; ');
        return res;
    }

    exportActive(): string | null {
        return this.active ? serializeTemplate(this.active) : null;
    }
}
