<script lang="ts">
    /**
     * Print options + the print button. Options are clamped to the connected
     * printer's capabilities; the button is disabled while printing and
     * re-enables on the session's idle transition.
     */
    import { fromStore } from 'svelte/store';
    import { DEFAULT_PAPER_PROFILES, type UniversalPrintOptions, type PaperProfile } from 'universal-label-core';
    import type { PrinterSession } from '../printer/session';
    import type { EditorStore } from '../stores/editor.svelte';
    import { rasterizeDesign, planInks, previewBinding } from 'universal-label-renderer';

    interface Props {
        session: PrinterSession;
        editor: EditorStore;
    }
    let { session, editor }: Props = $props();

    // svelte-ignore state_referenced_locally -- session identity is stable.
    const printer = fromStore(session);
    const snap = $derived(printer.current);
    const caps = $derived(snap.capabilities);

    let density = $state(8);
    let copies = $state(1);
    
    // Fallback to the first paper profile if the design has none
    let activePaperId = $state<string>('');
    let activePaper = $derived(DEFAULT_PAPER_PROFILES.find(p => p.id === activePaperId) || editor.design.paper || DEFAULT_PAPER_PROFILES[0]);
    
    let speed = $state(1);
    let printError = $state('');
    let printedOk = $state(false);

    $effect(() => {
        if (caps) density = Math.min(density, caps.maxDensity);
        
        // Ensure activePaperId is synced (though UI select moved to Toolbar)
        if (editor.design.paper) {
            activePaperId = editor.design.paper.id;
        } else if (!activePaperId) {
            activePaperId = DEFAULT_PAPER_PROFILES[0].id;
        }
    });

    const enforcesFeedBefore = $derived(
        caps?.mediaDefaults?.feedBeforeMinPx !== undefined && 
        caps.mediaDefaults.feedBeforeMinPx === caps.mediaDefaults.feedBeforeMaxPx
    );
    const enforcesFeedAfter = $derived(
        caps?.mediaDefaults?.feedAfterMinPx !== undefined && 
        caps.mediaDefaults.feedAfterMinPx === caps.mediaDefaults.feedAfterMaxPx
    );

    const printableHeightPx = $derived(caps
        ? Math.min(caps.canvasHeightPx, Math.round(activePaper.tapeWidthMm * caps.dpmm))
        : editor.design.heightPx
    );
    const designHeightMm = $derived(editor.design.heightPx / editor.pxPerMm);
    const heightMismatch = $derived(caps !== undefined && editor.design.heightPx !== printableHeightPx);

    /**
     * How many separated ink planes this printer accepts. The renderer resolves
     * the design's slots against this budget, so a colour the hardware cannot
     * develop is merged or dropped while there is still a design to re-render.
     */
    const inkChannels = $derived(caps?.colorSupport.channels ?? 1);

    /**
     * Colours that will not come out as designed on this printer and paper.
     *
     * Shown before printing rather than after: the whole point of resolving
     * slots up front is that the user can change the roll instead of discovering
     * a black banner where they wanted red.
     */
    const inkCompromises = $derived(
        planInks({ ...editor.design, paper: activePaper }, inkChannels).compromises
    );

    /** Colorants the loaded roll can develop. */
    const paperInks = $derived(activePaper.inks ?? []);

    /**
     * Slot -> colorant, shown here rather than in the designer because it is a
     * per-job question: not "what colour did I want" but "what is in the machine
     * right now". Each row shows what it would auto-match to, so leaving every
     * one on Auto is a real answer rather than an unmade decision.
     */
    const bindingRows = $derived(
        editor.slots.map(slot => ({
            slot,
            chosen: editor.inkBindings.find(b => b.paperId === activePaper.id)?.map[slot.id],
            resolved: previewBinding(slot, paperInks, editor.inkBindings.find(b => b.paperId === activePaper.id))
        }))
    );

    async function print(): Promise<void> {
        printError = '';
        printedOk = false;
        try {
            const page = await rasterizeDesign(editor.design, undefined, { inkChannels });
            const options: UniversalPrintOptions = {
                paper: activePaper,
                density,
                copies,
                ...(caps?.supportsSpeedMode ? { speed } : {}),
                ...(activePaper.type === 'continuous' ? { feedOverrides: { 
                    feedBeforeMm: typeof editor.printFeedBeforeMm === 'number' ? editor.printFeedBeforeMm : undefined, 
                    feedAfterMm: typeof editor.printFeedAfterMm === 'number' ? editor.printFeedAfterMm : undefined 
                } } : {})
            };
            for (let i = 0; i < copies; i++) {
                // Drivers treat options.copies as metadata; the spooler prints
                // one page per print() call, so we loop explicitly.
                await session.print(page, options);
            }
            printedOk = true;
        } catch (err) {
            printError = err instanceof Error ? err.message : String(err);
        }
    }
</script>

<div class="panel">
    {#if !caps}
        <div class="hint">Connect a printer to print.</div>
    {:else}
        {#if heightMismatch}
            <div class="warn">
                Design height ({designHeightMm.toFixed(1)}mm) doesn't match this paper's
                {printableHeightPx}px printable width.
                <button onclick={() => {
                    editor.setLabelSize(editor.design.widthPx, printableHeightPx);
                }}>
                    Resize design to printable width
                </button>
            </div>
        {/if}
        {#if bindingRows.length > 0 && paperInks.length > 1}
            <div class="inks">
                <span class="inks-title">Inks on this roll</span>
                {#each bindingRows as r (r.slot.id)}
                    <div class="ink-row">
                        <span class="ink-dot" style="background: {r.slot.intent ?? '#111111'}"></span>
                        <span class="ink-name">{r.slot.name ?? r.slot.id}</span>
                        <select
                            value={r.chosen ?? ''}
                            onchange={e => editor.bindSlot(activePaper.id, r.slot.id, e.currentTarget.value || undefined)}
                        >
                            <option value="">Auto{r.resolved ? ` (${r.resolved.name ?? r.resolved.id})` : ''}</option>
                            {#each paperInks as ink (ink.id)}
                                <option value={ink.id}>{ink.name ?? ink.id}</option>
                            {/each}
                        </select>
                        <span class="ink-dot" style="background: {r.resolved?.color ?? 'transparent'}"></span>
                    </div>
                {/each}
            </div>
        {/if}
        {#each inkCompromises as c (c.slotId)}
            <div class="warn">
                {#if c.action === 'drop'}
                    “{c.slotName}” will not print —
                {:else}
                    “{c.slotName}” will print in the primary colour —
                {/if}
                {#if c.reason === 'no-colorant'}
                    this paper cannot develop it.
                {:else}
                    this printer has no spare ink channel for it.
                {/if}
            </div>
        {/each}
        <div class="row">
            <label class="opt">
                Density
                <input type="range" min="1" max={caps.maxDensity} bind:value={density} />
                <span class="val">{density}/{caps.maxDensity}</span>
            </label>
        </div>
        <div class="row">
            <label class="opt">
                Copies
                <input type="number" min="1" max="99" bind:value={copies} />
            </label>
            {#if caps.supportsSpeedMode}
                <label class="opt">
                    Speed
                    <input type="number" min="1" max="5" bind:value={speed} />
                </label>
            {/if}
        </div>
        {#if activePaper.type === 'continuous'}
            <details class="advanced" bind:open={editor.showAdvancedFeedingPreview}>
                <summary>Advanced feeding options</summary>
                <div class="row">
                    <label class="opt" title="Distance to feed before printing starts">
                        Feed Before (mm)
                        <input 
                            type="number" 
                            min={caps.mediaDefaults?.feedBeforeMinPx !== undefined ? (caps.mediaDefaults.feedBeforeMinPx / caps.dpmm).toFixed(1) : 0}
                            max={caps.mediaDefaults?.feedBeforeMaxPx !== undefined ? (caps.mediaDefaults.feedBeforeMaxPx / caps.dpmm).toFixed(1) : 100}
                            bind:value={editor.printFeedBeforeMm} 
                            disabled={enforcesFeedBefore}
                            placeholder={caps.mediaDefaults?.feedBeforeDefaultPx !== undefined ? (caps.mediaDefaults.feedBeforeDefaultPx / caps.dpmm).toFixed(1) : "0"} 
                        />
                    </label>
                    <label class="opt" title="Distance to feed after printing ends (for tearing/cutting)">
                        Feed After (mm)
                        <input 
                            type="number" 
                            min={caps.mediaDefaults?.feedAfterMinPx !== undefined ? (caps.mediaDefaults.feedAfterMinPx / caps.dpmm).toFixed(1) : 0}
                            max={caps.mediaDefaults?.feedAfterMaxPx !== undefined ? (caps.mediaDefaults.feedAfterMaxPx / caps.dpmm).toFixed(1) : 100}
                            bind:value={editor.printFeedAfterMm} 
                            disabled={enforcesFeedAfter}
                            placeholder={caps.mediaDefaults?.feedAfterDefaultPx !== undefined ? (caps.mediaDefaults.feedAfterDefaultPx / caps.dpmm).toFixed(1) : "0"} 
                        />
                    </label>
                </div>
            </details>
        {/if}
        <button
            class="primary print"
            disabled={snap.state !== 'connected'}
            onclick={print}
        >
            {snap.state === 'printing' ? 'Printing…' : `Print ${copies > 1 ? copies + ' copies' : 'label'}`}
        </button>
        {#if printError}
            <div class="error">{printError}</div>
        {:else if printedOk}
            <div class="ok">Sent to printer.</div>
        {/if}
    {/if}
</div>

<style>
    .panel {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 10px;
        background: var(--panel);
        border-radius: 8px;
    }
    .row {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
        align-items: center;
    }
    .opt {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .opt input[type='range'] {
        width: 140px;
    }
    .opt input[type='number'] {
        width: 64px;
    }
    .val {
        font-variant-numeric: tabular-nums;
        color: var(--muted);
    }
    .print {
        font-size: 16px;
        padding: 12px;
    }
    .hint {
        color: var(--muted);
    }
    .warn {
        color: var(--warn);
        font-size: 13px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        align-items: flex-start;
    }
    .error {
        color: var(--danger);
        font-size: 13px;
    }
    .inks {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .inks-title {
        font-size: 12px;
        color: var(--muted);
    }
    .ink-row {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
    }
    .ink-name {
        flex: 1;
    }
    .ink-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 1px solid var(--border);
        flex: none;
    }
    .ok {
        color: var(--ok);
        font-size: 13px;
    }
    .advanced {
        border-top: 1px solid var(--border);
        padding-top: 8px;
        margin-top: 4px;
    }
    .advanced summary {
        font-size: 12px;
        color: var(--muted);
        cursor: pointer;
        user-select: none;
        margin-bottom: 12px;
    }
    .advanced summary:hover {
        color: var(--text);
    }
</style>
