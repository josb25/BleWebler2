<script lang="ts">
    /**
     * The menu bar across the top of the editor: File, Edit, Insert, Layout,
     * View and Window, each a dropdown of plain commands, Photoshop-style.
     *
     * The menus only *name* things; every command is an editor-store call or
     * a shared action from `lib/editor-actions`, so the palette, the options
     * bar and the phone toolbar do exactly the same thing by other routes.
     */
    import type { EditorStore } from '../stores/editor.svelte';
    import { globalSettings as settings } from '../stores/settings.svelte';
    import {
        clearCanvas, exportLabel, importLabel, saveAs,
        type PlacingTool, type ShapeKind
    } from '../lib/editor-actions';

    type Item =
        | { kind: 'item'; label: string; shortcut?: string; disabled?: boolean; checked?: boolean; run: () => void }
        | { kind: 'sep' };
    interface Menu { id: string; label: string; items: Item[]; }

    interface Props {
        editor: EditorStore;
        onSaveTemplate: () => void;
        onOpenSheet: (sheet: 'paper' | 'params' | 'printer' | 'settings') => void;
        onSheetTab: (tab: 'design' | 'preview' | 'adapt') => void;
        onBack: () => void;
        onPrint: () => void;
        onZoom: (action: 'in' | 'out' | 'fit' | 'reset') => void;
        onInsert: (tool: PlacingTool, shapeKind?: ShapeKind) => void;
    }
    let { editor, onSaveTemplate, onOpenSheet, onSheetTab, onBack, onPrint, onZoom, onInsert }: Props = $props();

    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
    const mod = isMac ? '⌘' : 'Ctrl+';

    let open = $state<string | null>(null);
    let root = $state<HTMLElement | null>(null);
    let importInput = $state<HTMLInputElement | null>(null);

    const sep: Item = { kind: 'sep' };
    const item = (label: string, run: () => void, extra: Partial<Extract<Item, { kind: 'item' }>> = {}): Item =>
        ({ kind: 'item', label, run, ...extra });

    const empty = $derived(editor.design.elements.length === 0);
    const sel = $derived(editor.selected);

    const menus = $derived<Menu[]>([
        {
            id: 'file', label: 'File', items: [
                item('Save', () => editor.save(), { shortcut: `${mod}S`, disabled: empty }),
                item('Save as…', () => saveAs(editor), { disabled: empty }),
                item('Auto-save', () => (editor.autoSave = !editor.autoSave), { checked: editor.autoSave }),
                sep,
                item('Import (JSON)…', () => importInput?.click()),
                item('Export (JSON)', () => exportLabel(editor)),
                sep,
                item('Reusable design…', onSaveTemplate, { disabled: empty }),
                item('Design fields…', () => { editor.makeTemplate(); onOpenSheet('params'); }),
                sep,
                item('Clear canvas', () => clearCanvas(editor), { disabled: empty }),
                sep,
                item('Print…', onPrint, { shortcut: `${mod}P` }),
                item('Back to designs', onBack)
            ]
        },
        {
            id: 'edit', label: 'Edit', items: [
                item('Undo', () => editor.undo(), { shortcut: `${mod}Z`, disabled: !editor.canUndo }),
                item('Redo', () => editor.redo(), { shortcut: `${mod}Y`, disabled: !editor.canRedo }),
                sep,
                item('Delete', () => editor.deleteSelected(), { shortcut: 'Del', disabled: !sel }),
                item(sel?.locked ? 'Unlock' : 'Lock', () => editor.toggleLock(), { disabled: !sel }),
                sep,
                item('Bring to front', () => editor.reorderSelected('front'), { disabled: !sel }),
                item('Bring forward', () => editor.reorderSelected('forward'), { disabled: !sel }),
                item('Send backward', () => editor.reorderSelected('backward'), { disabled: !sel }),
                item('Send to back', () => editor.reorderSelected('back'), { disabled: !sel }),
                sep,
                item('Deselect', () => (editor.selectedId = null), { shortcut: 'Esc', disabled: !sel })
            ]
        },
        {
            id: 'insert', label: 'Insert', items: [
                item('Text', () => onInsert('text'), { shortcut: 'T' }),
                item('Barcode', () => onInsert('barcode'), { shortcut: 'B' }),
                item('QR code', () => onInsert('qr'), { shortcut: 'Q' }),
                item('Data Matrix', () => onInsert('datamatrix'), { shortcut: 'M' }),
                sep,
                item('Line', () => onInsert('shape', 'line')),
                item('Box', () => onInsert('shape', 'rect')),
                item('Ellipse', () => onInsert('shape', 'ellipse')),
                item('Symbol', () => onInsert('symbol'), { shortcut: 'S' }),
                sep,
                item('Image…', () => document.getElementById('menubar-image-input')?.click())
            ]
        },
        {
            id: 'layout', label: 'Layout', items: [
                item('Paper setup…', () => onOpenSheet('paper')),
                ...(editor.isContinuousMedia
                    ? [item('Auto length', () => editor.setAutoLength(!editor.autoLength), { checked: editor.autoLength })]
                    : []),
                sep,
                item('Snap to guides', () => (editor.snapMode = !editor.snapMode), { checked: editor.snapMode }),
                item('Snap to grid', () => (editor.gridEnabled = !editor.gridEnabled), { checked: editor.gridEnabled })
            ]
        },
        {
            id: 'view', label: 'View', items: [
                item('Zoom in', () => onZoom('in'), { shortcut: `${mod}+` }),
                item('Zoom out', () => onZoom('out'), { shortcut: `${mod}−` }),
                item('Fit label', () => onZoom('fit'), { shortcut: `${mod}0` }),
                item('Actual pixels (100%)', () => onZoom('reset'), { shortcut: `${mod}1` }),
                sep,
                item('Show grid', () => (editor.gridEnabled = !editor.gridEnabled), { checked: editor.gridEnabled }),
                sep,
                item('Design', () => onSheetTab('design')),
                item('Test fields', () => onSheetTab('preview')),
                item('Compatibility', () => onSheetTab('adapt'))
            ]
        },
        {
            id: 'window', label: 'Window', items: [
                item('Panels', () => { settings.rightOpen = !settings.rightOpen; settings.save(); }, { checked: settings.rightOpen }),
                item('Layers', () => { settings.leftOpen = !settings.leftOpen; settings.save(); }, { checked: settings.leftOpen }),
                sep,
                item('Printer…', () => onOpenSheet('printer')),
                item('Settings…', () => onOpenSheet('settings'))
            ]
        }
    ]);

    function toggle(id: string): void { open = open === id ? null : id; }
    function hover(id: string): void { if (open !== null && open !== id) open = id; }
    function run(it: Extract<Item, { kind: 'item' }>): void {
        open = null;
        if (!it.disabled) it.run();
    }
    function onWindowPointerDown(e: PointerEvent): void {
        if (open !== null && root && !root.contains(e.target as Node)) open = null;
    }
    function onWindowKeydown(e: KeyboardEvent): void {
        if (open !== null && e.key === 'Escape') { open = null; e.stopPropagation(); }
    }
    function onImport(e: Event): void {
        const input = e.currentTarget as HTMLInputElement;
        importLabel(editor, input.files);
        input.value = '';
    }
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onWindowKeydown} />

<nav class="menubar" bind:this={root} aria-label="Editor menu">
    {#each menus as menu (menu.id)}
        <div class="menu" class:open={open === menu.id}>
            <button
                type="button"
                class="title"
                aria-haspopup="menu"
                aria-expanded={open === menu.id}
                onclick={() => toggle(menu.id)}
                onpointerenter={() => hover(menu.id)}
            >{menu.label}</button>
            {#if open === menu.id}
                <div class="dropdown" role="menu" aria-label={menu.label}>
                    {#each menu.items as it, i (i)}
                        {#if it.kind === 'sep'}
                            <div class="sep" role="separator"></div>
                        {:else}
                            <button
                                type="button"
                                role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                                aria-checked={it.checked === undefined ? undefined : it.checked}
                                class="entry"
                                disabled={it.disabled}
                                onclick={() => run(it)}
                            >
                                <span class="tick" aria-hidden="true">{it.checked ? '✓' : ''}</span>
                                <span class="label">{it.label}</span>
                                {#if it.shortcut}<span class="shortcut">{it.shortcut}</span>{/if}
                            </button>
                        {/if}
                    {/each}
                </div>
            {/if}
        </div>
    {/each}
    <input bind:this={importInput} type="file" accept=".json,application/json" hidden onchange={onImport} />
</nav>

<style>
    .menubar {
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 0 6px;
        min-height: 30px;
        background: var(--panel);
        border-bottom: 1px solid var(--border);
        font-size: 13px;
        user-select: none;
    }
    .menu { position: relative; }
    .title {
        min-height: 26px;
        padding: 2px 10px;
        border: none;
        border-radius: 5px;
        background: transparent;
        color: var(--text);
        box-shadow: none;
        font-weight: 500;
    }
    .title:hover:not(:disabled), .menu.open .title {
        transform: none;
        box-shadow: none;
        background: var(--panel-2);
    }
    .menu.open .title { color: var(--accent); }
    .dropdown {
        position: absolute;
        top: calc(100% + 2px);
        left: 0;
        z-index: 60;
        min-width: 230px;
        padding: 4px;
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 8px;
        box-shadow: var(--shadow-hover, 0 10px 30px rgb(0 0 0 / 22%));
        display: flex;
        flex-direction: column;
    }
    .entry {
        display: grid;
        grid-template-columns: 18px 1fr auto;
        align-items: center;
        gap: 8px;
        width: 100%;
        min-height: 28px;
        padding: 3px 10px 3px 6px;
        border: none;
        border-radius: 5px;
        background: transparent;
        color: var(--text);
        box-shadow: none;
        text-align: left;
        font-weight: 400;
        font-size: 13px;
    }
    .entry:hover:not(:disabled) {
        transform: none;
        box-shadow: none;
        background: var(--accent);
        color: var(--accent-fg, #fff);
    }
    .entry:disabled { color: var(--muted); opacity: 0.7; cursor: default; }
    .tick { font-size: 12px; text-align: center; }
    .shortcut { font-size: 12px; opacity: 0.7; padding-left: 18px; }
    .sep { height: 1px; margin: 4px 6px; background: var(--border); }
</style>
