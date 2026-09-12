<script lang="ts">
    /**
     * The vertical tool palette on the left of the editor, Photoshop-style.
     *
     * One tool is active at a time. `move` selects and drags; every other
     * tool places a new element where the label is clicked. The shape tool
     * keeps a flyout for its kind, opened by clicking the tool again while it
     * is already active — the same gesture as holding a Photoshop tool.
     *
     * The image tool is the exception: an image needs a file first, so it
     * opens the picker straight away rather than waiting for a click.
     */
    import Icon, { type IconName } from './Icon.svelte';
    import {
        SHAPE_KINDS, TOOL_LABELS, TOOL_SHORTCUTS,
        type EditorTool, type ShapeKind
    } from '../lib/editor-actions';

    interface Props {
        tool: EditorTool;
        shapeKind: ShapeKind;
        ontool: (tool: EditorTool) => void;
        onshapekind: (kind: ShapeKind) => void;
        onzoom: (action: 'in' | 'out' | 'fit') => void;
        onimage: () => void;
    }
    let { tool, shapeKind, ontool, onshapekind, onzoom, onimage }: Props = $props();

    const TOOLS: { id: EditorTool; icon: IconName }[] = [
        { id: 'move', icon: 'move' },
        { id: 'text', icon: 'type' },
        { id: 'barcode', icon: 'barcode' },
        { id: 'qr', icon: 'qr' },
        { id: 'datamatrix', icon: 'datamatrix' },
        { id: 'shape', icon: 'shapes' },
        { id: 'symbol', icon: 'star' },
        { id: 'image', icon: 'image' }
    ];
    const SHAPE_ICONS: Record<ShapeKind, IconName> = { rect: 'square', ellipse: 'circle', line: 'line' };

    let flyout = $state(false);

    function pick(id: EditorTool): void {
        if (id === 'image') { onimage(); return; }
        if (id === 'shape' && tool === 'shape') { flyout = !flyout; return; }
        flyout = false;
        ontool(id);
    }

    function chooseShape(kind: ShapeKind): void {
        onshapekind(kind);
        ontool('shape');
        flyout = false;
    }

</script>

<div class="palette" role="toolbar" aria-label="Tools" aria-orientation="vertical">
    {#each TOOLS as t (t.id)}
        <div class="slot">
            <button
                type="button"
                class="tool"
                class:active={tool === t.id}
                title="{TOOL_LABELS[t.id]} ({TOOL_SHORTCUTS[t.id]})"
                aria-label="{TOOL_LABELS[t.id]} tool"
                aria-pressed={tool === t.id}
                onclick={() => pick(t.id)}
            >
                <Icon name={t.id === 'shape' ? SHAPE_ICONS[shapeKind] : t.icon} size={18} />
                {#if t.id === 'shape'}<span class="corner" aria-hidden="true"></span>{/if}
            </button>
            {#if t.id === 'shape' && flyout}
                <div class="flyout" role="menu" aria-label="Shape kind">
                    {#each SHAPE_KINDS as s (s.kind)}
                        <button
                            type="button"
                            role="menuitemradio"
                            aria-checked={shapeKind === s.kind}
                            class:active={shapeKind === s.kind}
                            onclick={() => chooseShape(s.kind)}
                        >
                            <Icon name={SHAPE_ICONS[s.kind]} size={16} /> {s.label}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
    {/each}
    <div class="divider"></div>
    <button type="button" class="tool" title="Zoom in (Ctrl +)" aria-label="Zoom in" onclick={() => onzoom('in')}><Icon name="zoom-in" size={18} /></button>
    <button type="button" class="tool" title="Zoom out (Ctrl −)" aria-label="Zoom out" onclick={() => onzoom('out')}><Icon name="zoom-out" size={18} /></button>
    <button type="button" class="tool" title="Fit label (Ctrl 0)" aria-label="Fit label" onclick={() => onzoom('fit')}><Icon name="maximize" size={18} /></button>
</div>

<style>
    .palette {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 6px 0;
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        overflow: visible;
    }
    .slot { position: relative; }
    .tool {
        position: relative;
        width: 36px;
        height: 34px;
        min-height: 0;
        padding: 0;
        border: 1px solid transparent;
        border-radius: 2px;
        background: transparent;
        color: var(--text);
        box-shadow: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }
    .tool:hover:not(:disabled) {
        transform: none;
        box-shadow: none;
        background: var(--panel-2);
    }
    .tool.active {
        background: var(--accent);
        color: var(--accent-fg, #fff);
        border-color: transparent;
    }
    /* The tiny corner mark Photoshop puts on tools that hide a flyout. */
    .corner {
        position: absolute;
        right: 3px;
        bottom: 3px;
        width: 0;
        height: 0;
        border-right: 5px solid currentColor;
        border-top: 5px solid transparent;
        opacity: 0.75;
    }
    .flyout {
        position: absolute;
        left: calc(100% + 6px);
        top: 0;
        z-index: 40;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 130px;
        padding: 4px;
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 2px;
        box-shadow: var(--shadow-hover, 0 8px 24px rgb(0 0 0 / 20%));
    }
    .flyout button {
        justify-content: flex-start;
        gap: 8px;
        min-height: 30px;
        padding: 4px 10px;
        border: none;
        border-radius: 2px;
        background: transparent;
        box-shadow: none;
        font-size: 13px;
        white-space: nowrap;
    }
    .flyout button:hover { transform: none; background: var(--panel-2); }
    .flyout button.active { color: var(--accent); }
    .divider {
        width: 24px;
        height: 1px;
        margin: 6px 0;
        background: var(--border);
    }
</style>
