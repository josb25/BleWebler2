<script lang="ts">
    /**
     * The options bar under the menus: what the active tool does, and the
     * few label-wide settings worth keeping one click away — length, snapping,
     * the black/white threshold — the way Photoshop keeps a tool's options
     * above the canvas instead of buried in a panel.
     */
    import type { EditorStore } from '../stores/editor.svelte';
    import Icon, { type IconName } from './Icon.svelte';
    import { SHAPE_KINDS, TOOL_LABELS, TOOL_SHORTCUTS, type EditorTool, type ShapeKind } from '../lib/editor-actions';

    interface Props {
        editor: EditorStore;
        tool: EditorTool;
        shapeKind: ShapeKind;
        onshapekind: (kind: ShapeKind) => void;
        ontool: (tool: EditorTool) => void;
        /** Place the active tool's element at the label centre. */
        oninsertcentre: () => void;
    }
    let { editor, tool, shapeKind, onshapekind, ontool, oninsertcentre }: Props = $props();

    const TOOL_ICONS: Record<EditorTool, IconName> = {
        move: 'move', text: 'type', barcode: 'barcode', qr: 'qr',
        datamatrix: 'datamatrix', shape: 'shapes', symbol: 'star', image: 'image'
    };
    const SHAPE_ICONS: Record<ShapeKind, IconName> = { rect: 'square', ellipse: 'circle', line: 'line' };

    const sel = $derived(editor.selected);
    const widthMm = $derived(Math.round((editor.design.widthPx / editor.authoringDpmm) * 10) / 10);

    const hint = $derived.by(() => {
        if (tool === 'move') {
            return sel
                ? `${sel.type} selected · drag to move, arrows to nudge (Shift for 8 px)`
                : 'Click an element to select it · drag the empty label to pan';
        }
        return `Click on the label to place a ${TOOL_LABELS[tool].toLowerCase()} · Esc returns to Move`;
    });
</script>

<div class="options" role="toolbar" aria-label="Tool options">
    <div class="tool-id" title="Active tool ({TOOL_SHORTCUTS[tool]})">
        <Icon name={TOOL_ICONS[tool]} size={16} />
        <span>{TOOL_LABELS[tool]}</span>
    </div>
    <div class="divider"></div>

    {#if tool === 'shape'}
        <div class="group" role="radiogroup" aria-label="Shape kind">
            {#each SHAPE_KINDS as s (s.kind)}
                <button
                    type="button"
                    class="mini"
                    class:active={shapeKind === s.kind}
                    role="radio"
                    aria-checked={shapeKind === s.kind}
                    title={s.label}
                    onclick={() => onshapekind(s.kind)}
                ><Icon name={SHAPE_ICONS[s.kind]} size={14} /> {s.label}</button>
            {/each}
        </div>
        <div class="divider"></div>
    {/if}

    {#if tool !== 'move'}
        <button type="button" class="mini" onclick={oninsertcentre}><Icon name="plus" size={14} /> Place at centre</button>
        <button type="button" class="mini" onclick={() => ontool('move')}>Cancel</button>
        <div class="divider"></div>
    {:else if sel}
        <div class="group">
            <button type="button" class="mini" title={sel.locked ? 'Unlock' : 'Lock'} aria-label={sel.locked ? 'Unlock' : 'Lock'} onclick={() => editor.toggleLock()}>
                <Icon name={sel.locked ? 'lock' : 'unlock'} size={14} />
            </button>
            <button type="button" class="mini" title="Bring to front" aria-label="Bring to front" onclick={() => editor.reorderSelected('front')}><Icon name="chevron-up" size={14} /><Icon name="chevron-up" size={14} /></button>
            <button type="button" class="mini" title="Bring forward" aria-label="Bring forward" onclick={() => editor.reorderSelected('forward')}><Icon name="chevron-up" size={14} /></button>
            <button type="button" class="mini" title="Send backward" aria-label="Send backward" onclick={() => editor.reorderSelected('backward')}><Icon name="chevron-down" size={14} /></button>
            <button type="button" class="mini" title="Send to back" aria-label="Send to back" onclick={() => editor.reorderSelected('back')}><Icon name="chevron-down" size={14} /><Icon name="chevron-down" size={14} /></button>
            <button type="button" class="mini danger" title="Delete (Del)" aria-label="Delete" onclick={() => editor.deleteSelected()}><Icon name="trash" size={14} /></button>
        </div>
        <div class="divider"></div>
    {/if}

    <span class="hint">{hint}</span>
    <span class="spacer"></span>

    <label class="field">
        <span class="lbl">Length</span>
        <input
            type="number"
            min="4"
            max="500"
            step="0.5"
            value={widthMm}
            disabled={editor.autoLength}
            title={editor.autoLength ? 'Set automatically from the content' : 'Label length in mm'}
            onchange={e => editor.setLabelSize(Number(e.currentTarget.value) * editor.authoringDpmm)}
        />
        <span class="unit">mm</span>
    </label>
    {#if editor.isContinuousMedia}
        <label class="check" title="Feed exactly as much tape as the content needs">
            <input type="checkbox" checked={editor.autoLength} onchange={e => editor.setAutoLength(e.currentTarget.checked)} />
            Auto
        </label>
    {/if}
    <div class="divider"></div>
    <label class="check"><input type="checkbox" bind:checked={editor.snapMode} /> Guides</label>
    <label class="check"><input type="checkbox" bind:checked={editor.gridEnabled} /> Grid</label>
    <input class="grid-size" type="number" min="1" max="64" bind:value={editor.gridSize} disabled={!editor.gridEnabled} aria-label="Grid size in pixels" />
    <div class="divider"></div>
    <label class="field" title="Black/white threshold">
        <span class="lbl">Threshold</span>
        <input type="range" min="1" max="254" value={editor.design.threshold} oninput={e => editor.setThreshold(Number(e.currentTarget.value))} />
        <span class="unit dim">{editor.design.threshold}</span>
    </label>
</div>

<style>
    .options {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 36px;
        padding: 3px 10px;
        background: var(--panel);
        border-bottom: 1px solid var(--border);
        font-size: 12px;
        overflow-x: auto;
        scrollbar-width: none;
        white-space: nowrap;
    }
    .options::-webkit-scrollbar { display: none; }
    .tool-id {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
        color: var(--accent);
    }
    .group { display: inline-flex; align-items: center; gap: 2px; }
    .divider { width: 1px; height: 20px; background: var(--border); flex: none; }
    .mini {
        min-height: 26px;
        padding: 2px 8px;
        border-radius: 2px;
        font-size: 12px;
        box-shadow: none;
        gap: 4px;
        border-color: transparent;
        background: transparent;
    }
    .mini:hover:not(:disabled) { transform: none; box-shadow: none; background: var(--panel-2); }
    .mini.active { background: var(--panel-2); color: var(--accent); border-color: var(--border); }
    .mini.danger:hover:not(:disabled) { color: var(--danger); }
    .hint { color: var(--muted); overflow: hidden; text-overflow: ellipsis; }
    .spacer { flex: 1; }
    .field { display: inline-flex; align-items: center; gap: 6px; }
    .field input[type="number"] { width: 64px; min-height: 26px; padding: 2px 6px; font-size: 12px; }
    .field input[type="range"] { width: 96px; }
    .lbl { color: var(--muted); }
    .unit { color: var(--text); }
    .dim { color: var(--muted); min-width: 24px; }
    .check { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; user-select: none; }
    .grid-size { width: 52px; min-height: 26px; padding: 2px 6px; font-size: 12px; }
</style>
