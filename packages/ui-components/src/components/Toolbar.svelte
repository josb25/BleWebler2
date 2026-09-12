<script lang="ts">
    /**
     * Ribbon toolbar containing grouped tools based on the active tab.
     */
    import type { EditorStore } from '../stores/editor.svelte';
    import { type ShapeKind } from 'universal-label-renderer';
    import { DEFAULT_PAPER_PROFILES } from 'universal-label-core';
    import { globalSettings as settings, DEFAULT_PRINTER_CAPS } from '../stores/settings.svelte';
    import Icon from './Icon.svelte';
    import {
        addShape as addShapeAction, addImageFromFile as addImageAction,
        exportLabel as exportAction, importLabel as importAction, saveAs as saveAsAction,
        clearCanvas as clearCanvasAction
    } from '../lib/editor-actions';

    interface Props {
        editor: EditorStore;
        activeTab: string;
        /** Phone-only compact presentation; regular ribbon callers stay unchanged. */
        compact?: boolean;
        /** When provided, the File tab exposes reusable-design settings. */
        onSaveTemplate?: () => void;
    }
    let { editor, activeTab = 'Insert', compact = false, onSaveTemplate }: Props = $props();

    let activeCapabilities = $derived(DEFAULT_PRINTER_CAPS[settings.defaultPrinter] || DEFAULT_PRINTER_CAPS['none']);
    let allPapers = $derived([...DEFAULT_PAPER_PROFILES, ...settings.customPapers]);
    let availablePapers = $derived(allPapers.filter(p => {
        // max width = physical printhead width (mm) + 10mm tolerance for guides
        const maxMm = (activeCapabilities.canvasHeightPx / (activeCapabilities.dpmm || 8)) + 10;
        return p.tapeWidthMm <= maxMm;
    }));

    let fileInput = $state<HTMLInputElement | null>(null);
    let importInput = $state<HTMLInputElement | null>(null);

    function addShape(kind: ShapeKind): void { addShapeAction(editor, kind); }

    function addImageFromFile(files: FileList | null): void {
        addImageAction(editor, files);
        if (fileInput) fileInput.value = '';
    }

    function exportLabel(): void { exportAction(editor); }
    function saveAs(): void { saveAsAction(editor); }

    function importLabel(files: FileList | null): void {
        try {
            importAction(editor, files);
        } finally {
            if (importInput) importInput.value = '';
        }
    }

    const widthMm = $derived(editor.design ? Math.round((editor.design.widthPx / editor.authoringDpmm) * 10) / 10 : 0);
</script>

<div class="toolbar" class:compact class:insert={activeTab === 'Insert'} class:file={activeTab === 'File'} class:layout={activeTab === 'Layout'}>
    {#if activeTab === 'File'}
        <div class="group">
            <button onclick={() => editor.save()} disabled={editor.design.elements.length === 0}><Icon name="save" /> Save</button>
            <button onclick={saveAs} disabled={editor.design.elements.length === 0}><Icon name="copy" /> Save as…</button>
            <label class="snap-toggle">
                <input type="checkbox" bind:checked={editor.autoSave} />
                Auto-save
            </label>
        </div>
        <div class="divider"></div>
        <div class="group">
            <button onclick={() => exportLabel()}><Icon name="download" /> Export (JSON)</button>
            <button onclick={() => importInput?.click()}><Icon name="upload" /> Import (JSON)</button>
            <input
                bind:this={importInput}
                type="file"
                accept=".json,application/json"
                hidden
                onchange={e => importLabel(e.currentTarget.files)}
            />
        </div>
        {#if onSaveTemplate}
            <div class="divider"></div>
            <div class="group">
                <!-- Offered whatever the document already is: "save it as a
                     template" is an action, not a mode you must be in first. -->
                <button onclick={onSaveTemplate} disabled={editor.design.elements.length === 0} title="Review this design's fields and supported label sizes">
                    <Icon name="tag" /> Reusable design…
                </button>
            </div>
        {/if}
        <div class="divider"></div>
        <div class="group">
            <button class="danger" onclick={() => clearCanvasAction(editor)}><Icon name="trash" /> Clear Canvas</button>
        </div>
    {:else if activeTab === 'Insert'}
        <div class="group">
            <button onclick={() => editor.addNew('text')}>+ Text</button>
            <button onclick={() => editor.addNew('barcode')}>+ Barcode</button>
            <button onclick={() => editor.addNew('qr')}>+ QR</button>
            <button onclick={() => editor.addNew('datamatrix')}>+ Data Matrix</button>
            <button onclick={() => addShape('line')}>+ Line</button>
            <button onclick={() => addShape('rect')}>+ Box</button>
            <button onclick={() => addShape('ellipse')}>+ Ellipse</button>
            <button onclick={() => editor.addNew('symbol')}>+ Symbol</button>
            <button onclick={() => fileInput?.click()}>+ Image</button>
            <input
                bind:this={fileInput}
                type="file"
                accept="image/*"
                hidden
                onchange={e => addImageFromFile(e.currentTarget.files)}
            />
        </div>
        <div class="divider"></div>
        <div class="group">
            <label class="snap-toggle">
                <input type="checkbox" bind:checked={editor.snapMode} />
                Snap to guides
            </label>
        </div>
    {:else if activeTab === 'Layout'}
        <div class="group">
            <label class="lbl" for="label-length">Length</label>
            <input
                id="label-length"
                type="number"
                min="4"
                max="500"
                step="0.5"
                value={widthMm}
                disabled={editor.autoLength}
                title={editor.autoLength ? 'Set automatically from the content' : undefined}
                onchange={e => editor.setLabelSize(Number(e.currentTarget.value) * editor.authoringDpmm)}
                style="width: 72px;"
            />
            <span class="lbl-suffix">mm</span>
            {#if editor.isContinuousMedia}
                <label class="snap-toggle" title="Feed exactly as much tape as the content needs">
                    <input
                        type="checkbox"
                        checked={editor.autoLength}
                        onchange={e => editor.setAutoLength(e.currentTarget.checked)}
                    />
                    Auto length
                </label>
            {/if}
        </div>
        <div class="divider"></div>
        <div class="group">
            <label class="lbl" for="label-threshold">Threshold</label>
            <input
                id="label-threshold"
                type="range"
                min="1"
                max="254"
                value={editor.design.threshold}
                oninput={e => editor.setThreshold(Number(e.currentTarget.value))}
                style="width: 100px;"
            />
            <span class="dim">{editor.design.threshold}</span>
        </div>
        <div class="divider"></div>
        <div class="group">
            <label class="snap-toggle">
                <input type="checkbox" bind:checked={editor.gridEnabled} />
                Snap to grid
            </label>
            <input
                type="number"
                min="1"
                max="64"
                bind:value={editor.gridSize}
                disabled={!editor.gridEnabled}
                aria-label="Grid size in pixels"
                style="width: 60px;"
            />
            <span class="lbl-suffix">px</span>
        </div>
    {/if}
</div>

<style>
    .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        width: 100%;
    }
    .group {
        display: flex;
        gap: 8px;
        align-items: center;
    }
    .divider {
        width: 1px;
        height: 24px;
        background: var(--border);
        margin: 0 8px;
    }
    .snap-toggle {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 13px;
        cursor: pointer;
        user-select: none;
    }
    .lbl {
        color: var(--muted);
        font-size: 13px;
    }
    .lbl-suffix {
        font-size: 13px;
        color: var(--text);
    }
    .dim {
        color: var(--muted);
        font-size: 12px;
        min-width: 24px;
    }
    @media (max-width: 640px) {
        .group {
            flex-wrap: wrap;
            min-width: 0;
            max-width: 100%;
        }
        .divider { display: none; }
        .toolbar button {
            min-width: 0;
            max-width: 100%;
            min-height: 42px;
            line-height: 1.2;
            white-space: normal;
            overflow-wrap: anywhere;
        }
        .toolbar.insert .group:first-child {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            width: 100%;
        }
        .toolbar.insert .group:first-child button { width: 100%; }
        .toolbar.compact.insert {
            display: block;
            padding: 2px 2px 8px;
        }
        .toolbar.compact.insert .group:first-child {
            display: flex;
            flex-wrap: nowrap;
            width: 100%;
            max-width: 100%;
            overflow-x: auto;
            scrollbar-width: none;
            scroll-snap-type: x proximity;
        }
        .toolbar.compact.insert .group:first-child::-webkit-scrollbar {
            width: 0;
            height: 0;
            display: none;
        }
        .toolbar.compact.insert .group:first-child button {
            width: auto;
            min-width: max-content;
            white-space: nowrap;
            scroll-snap-align: start;
        }
        .toolbar.compact.insert .group:last-child {
            display: none;
        }
        .snap-toggle {
            min-height: 40px;
            padding: 4px 2px;
        }
    }
</style>
