<script lang="ts">
    /**
     * The strip along the bottom of the editor: zoom, document size, what is
     * selected, and the printer — the facts Photoshop keeps in its status bar
     * so the canvas can stay clean.
     */
    import type { EditorStore } from '../stores/editor.svelte';
    import Icon from './Icon.svelte';

    interface Props {
        editor: EditorStore;
        /** e.g. "LP90: connected" */
        printerLabel: string;
        printerState: string;
        onzoom: (action: 'in' | 'out' | 'fit' | 'reset') => void;
        onprinter: () => void;
    }
    let { editor, printerLabel, printerState, onzoom, onprinter }: Props = $props();

    const ZOOM_STEPS = [25, 50, 100, 200, 300, 400, 600, 800];
    const percent = $derived(Math.round(editor.zoom * 100));
    const mmW = $derived(Math.round((editor.design.widthPx / editor.pxPerMm) * 10) / 10);
    const mmH = $derived(Math.round((editor.design.heightPx / editor.pxPerMm) * 10) / 10);
    const sel = $derived(editor.selected);

    function setPercent(v: number): void {
        if (!Number.isFinite(v)) return;
        editor.zoom = Math.max(0.25, Math.min(16, v / 100));
    }
</script>

<div class="status" role="status" aria-label="Editor status">
    <div class="zoom">
        <button type="button" class="tiny" title="Zoom out" aria-label="Zoom out" onclick={() => onzoom('out')}><Icon name="minus" size={12} /></button>
        <input
            class="pct"
            type="number"
            min="25"
            max="1600"
            step="25"
            value={percent}
            aria-label="Zoom percentage"
            onchange={e => setPercent(Number(e.currentTarget.value))}
        />
        <span class="unit">%</span>
        <button type="button" class="tiny" title="Zoom in" aria-label="Zoom in" onclick={() => onzoom('in')}><Icon name="plus" size={12} /></button>
        <select class="steps" aria-label="Zoom presets" value={String(ZOOM_STEPS.includes(percent) ? percent : '')} onchange={e => { const v = e.currentTarget.value; if (v === 'fit') onzoom('fit'); else if (v) setPercent(Number(v)); }}>
            <option value="">…</option>
            {#each ZOOM_STEPS as z (z)}<option value={String(z)}>{z}%</option>{/each}
            <option value="fit">Fit</option>
        </select>
    </div>
    <span class="sep"></span>
    <span class="cell" title="Label size">{mmW} × {mmH} mm <span class="dim">· {editor.design.widthPx} × {editor.design.heightPx} px</span></span>
    <span class="sep"></span>
    <span class="cell">{editor.design.elements.length} {editor.design.elements.length === 1 ? 'element' : 'elements'}</span>
    {#if sel}
        <span class="sep"></span>
        <span class="cell" title="Selection">{sel.type} <span class="dim">@ {Math.round(sel.x)}, {Math.round(sel.y)} px</span></span>
    {/if}
    <span class="spacer"></span>
    <button type="button" class="printer state-{printerState}" onclick={onprinter} title="Printer">
        <span class="led" aria-hidden="true"></span>
        {printerLabel}
    </button>
</div>

<style>
    .status {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 26px;
        padding: 0 10px;
        background: var(--panel);
        border-top: 1px solid var(--border);
        font-size: 12px;
        color: var(--text);
        user-select: none;
    }
    .zoom { display: inline-flex; align-items: center; gap: 2px; }
    .tiny {
        width: 22px;
        height: 22px;
        min-height: 0;
        padding: 0;
        border: none;
        border-radius: 4px;
        background: transparent;
        box-shadow: none;
    }
    .tiny:hover:not(:disabled) { transform: none; box-shadow: none; background: var(--panel-2); }
    .pct {
        width: 58px;
        min-height: 22px;
        padding: 1px 4px;
        font-size: 12px;
        text-align: right;
    }
    .unit { color: var(--muted); }
    .steps { min-height: 22px; padding: 0 4px; font-size: 12px; }
    .sep { width: 1px; height: 14px; background: var(--border); }
    .cell { white-space: nowrap; }
    .dim { color: var(--muted); }
    .spacer { flex: 1; }
    .printer {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 22px;
        padding: 1px 8px;
        border: none;
        border-radius: 4px;
        background: transparent;
        box-shadow: none;
        font-size: 12px;
        font-weight: 500;
    }
    .printer:hover:not(:disabled) { transform: none; box-shadow: none; background: var(--panel-2); }
    .led { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
    .printer.state-connected .led { background: var(--ok); }
    .printer.state-printing .led { background: var(--accent); }
    .printer.state-connecting .led { background: var(--warn); }
</style>
