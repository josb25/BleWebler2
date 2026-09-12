<script lang="ts">
    /**
     * The adaptivity safety net, made visible. Renders the active template at
     * every size in the lint matrix as a 1-bit thumbnail, and badges any size
     * whose resolve produced an overflow/clipping issue — so "works on my size,
     * breaks on another" is caught at a glance before saving or sharing.
     */
    import type { TemplateSession } from '../stores/templates.svelte';
    import { resolveAcrossSizes, type TestSize } from 'universal-label-renderer';
    import { rasterizeDesign, compositePage } from 'universal-label-renderer';
    import type { LabelTemplate } from 'universal-label-renderer';
    import Icon from './Icon.svelte';

    interface Props { session: TemplateSession; }
    let { session }: Props = $props();

    interface Cell { size: TestSize; thumb: string; error: boolean; warn: boolean; messages: string[]; }
    let cells = $state<Cell[]>([]);

    // Re-render when the template, its params, or the lint outcome change.
    const fingerprint = $derived(
        session.active
            ? JSON.stringify({ id: session.active.id, params: session.params, n: session.active.elements.length })
            : ''
    );

    $effect(() => {
        void fingerprint;
        const tpl = session.active;
        if (!tpl) { cells = []; return; }
        let cancelled = false;
        void render(tpl).then(next => { if (!cancelled) cells = next; });
        return () => { cancelled = true; };
    });

    async function render(tpl: LabelTemplate): Promise<Cell[]> {
        const findings = session.lint?.findings ?? [];
        const out: Cell[] = [];
        for (const { size, result } of resolveAcrossSizes(tpl, session.params)) {
            const here = findings.filter(f => f.atSize.tapeWidthMm === size.tapeWidthMm && f.atSize.labelLengthMm === size.labelLengthMm);
            out.push({
                size,
                thumb: await thumb(result.design),
                error: here.some(f => f.severity === 'error'),
                warn: here.some(f => f.severity === 'warn'),
                messages: [...new Set(here.map(f => f.message))]
            });
        }
        return out;
    }

    async function thumb(design: Parameters<typeof rasterizeDesign>[0]): Promise<string> {
        try {
            const image = compositePage(await rasterizeDesign(design), { inks: design.paper?.inks });
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
            return canvas.toDataURL();
        } catch {
            return '';
        }
    }
</script>

<div class="gallery">
    {#each cells as cell (cell.size.label + cell.size.tapeWidthMm + cell.size.labelLengthMm)}
        <div class="cell" class:err={cell.error} class:warn={cell.warn && !cell.error} title={cell.messages.join('\n')}>
            <div class="thumb-wrap">
                {#if cell.thumb}
                    <img class="thumb" src={cell.thumb} alt={cell.size.label} />
                {:else}
                    <span class="ph"></span>
                {/if}
                {#if cell.error}
                    <span class="badge error" aria-label="Has errors"><Icon name="x" size={12} /></span>
                {:else if cell.warn}
                    <span class="badge warn" aria-label="Has warnings">!</span>
                {:else}
                    <span class="badge ok" aria-label="OK"><Icon name="check" size={12} /></span>
                {/if}
            </div>
            <div class="label">{cell.size.label}</div>
            <div class="dims">{cell.size.tapeWidthMm}×{cell.size.labelLengthMm}mm</div>
        </div>
    {/each}
</div>

<style>
    .gallery {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: 10px;
    }
    .cell {
        border: 1px solid var(--border);
        border-radius: 3px;
        padding: 8px;
        background: var(--panel);
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .cell.err { border-color: var(--danger); box-shadow: 0 0 0 1px var(--danger); }
    .cell.warn { border-color: var(--warn); }
    .thumb-wrap {
        position: relative;
        background:
            repeating-conic-gradient(var(--checker) 0% 25%, transparent 0% 50%) 50% / 12px 12px, #fff;
        border-radius: 2px;
        min-height: 60px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 8px;
        overflow: hidden;
    }
    .thumb {
        max-width: 100%;
        max-height: 60px;
        object-fit: contain;
        image-rendering: pixelated;
    }
    .ph { width: 50%; height: 30px; background: var(--panel-2); border-radius: 4px; }
    .badge {
        position: absolute;
        top: 4px;
        right: 4px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 800;
        color: #fff;
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    }
    .badge.ok { background: var(--ok); }
    .badge.warn { background: var(--warn); color: #1f2937; }
    .badge.error { background: var(--danger); color: var(--danger-fg, #fff); }
    .label {
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .dims { font-size: 11px; color: var(--muted); }
</style>
