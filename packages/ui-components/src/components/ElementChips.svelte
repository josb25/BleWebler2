<script lang="ts">
    /**
     * The layer list: every element on the canvas, in stacking order, and the
     * place to change that order.
     *
     * Presented **front-most first**, matching every other design tool — so
     * "drag up" means "bring towards the front", which is the whole point of
     * the list being draggable. The document itself stores the opposite order
     * (paint order, last drawn = on top), so display indices are mirrored on
     * the way in and out.
     *
     * Reordering uses pointer events rather than HTML5 drag-and-drop, which
     * does not fire on touch — the same reason every other gesture in the
     * editor is pointer-based.
     */
    import type { AnyElement } from 'universal-label-renderer';
    import type { EditorStore } from '../stores/editor.svelte';
    import Icon, { type IconName } from './Icon.svelte';

    interface Props {
        editor: EditorStore;
    }
    let { editor }: Props = $props();

    const ICONS: Record<AnyElement['type'], IconName> = {
        text: 'type',
        barcode: 'barcode',
        qr: 'qr',
        datamatrix: 'datamatrix',
        image: 'image',
        shape: 'shapes',
        symbol: 'star'
    };

    /** Front-most first. */
    const layers = $derived([...editor.design.elements].reverse());

    function label(el: AnyElement): string {
        const raw =
            el.type === 'text' ? el.text.split('\n')[0] :
            el.type === 'image' ? 'Image' :
            el.type === 'shape' ? el.shape :
            el.type === 'symbol' ? (el.path?.label ?? el.name) :
            el.data;
        const trimmed = raw.trim() === '' ? el.type : raw;
        return trimmed.length > 18 ? trimmed.slice(0, 17) + '…' : trimmed;
    }

    /** Display row index -> index in the document's paint order. */
    function toPaintIndex(row: number): number {
        return editor.design.elements.length - 1 - row;
    }

    let dragId = $state<string | null>(null);
    /** Row the dragged item currently sits at, for the live preview. */
    let dragRow = $state<number>(-1);
    let listEl = $state<HTMLDivElement | null>(null);

    function rowAtY(clientY: number): number {
        if (!listEl) return -1;
        const rows = [...listEl.querySelectorAll('.layer')] as HTMLElement[];
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i].getBoundingClientRect();
            if (clientY < r.top + r.height / 2) return i;
        }
        return rows.length - 1;
    }

    function startDrag(e: PointerEvent, el: AnyElement, row: number): void {
        if (el.locked) return;
        e.preventDefault();
        e.stopPropagation();
        dragId = el.id;
        dragRow = row;
        editor.selectedId = el.id;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }

    function moveDrag(e: PointerEvent): void {
        if (dragId === null) return;
        const row = rowAtY(e.clientY);
        if (row < 0 || row === dragRow) return;
        dragRow = row;
        // Reorder live: seeing the stack change as you drag is what makes the
        // front/back relationship obvious.
        editor.moveElementToIndex(dragId, toPaintIndex(row));
    }

    function endDrag(e: PointerEvent): void {
        if (dragId === null) return;
        try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* already released */ }
        dragId = null;
        dragRow = -1;
    }
</script>

{#if layers.length > 0}
    <div class="layers" bind:this={listEl}>
        <div class="head">
            <span class="title">Layers</span>
            <span class="hint">front</span>
        </div>

        {#each layers as el, row (el.id)}
            <div
                class="layer"
                class:active={editor.selectedId === el.id}
                class:dragging={dragId === el.id}
                class:locked={el.locked}
            >
                <!-- svelte-ignore a11y_no_static_element_interactions -- drag
                     handle; order is also changeable from the properties panel
                     and by keyboard there. -->
                <span
                    class="grip"
                    title={el.locked ? 'Locked' : 'Drag to reorder — up is nearer the front'}
                    onpointerdown={e => startDrag(e, el, row)}
                    onpointermove={moveDrag}
                    onpointerup={endDrag}
                    onpointercancel={endDrag}
                >
                    <Icon name={el.locked ? 'lock' : 'more'} size={13} />
                </span>
                <button
                    class="pick"
                    onclick={() => (editor.selectedId = editor.selectedId === el.id ? null : el.id)}
                >
                    <Icon name={ICONS[el.type]} size={14} />
                    <span class="name">{label(el)}</span>
                </button>
            </div>
        {/each}

        <div class="foot"><span class="hint">back</span></div>
    </div>
{/if}

<style>
    .layers {
        display: flex;
        flex-direction: column;
        gap: 3px;
    }
    .head,
    .foot {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 4px 2px;
    }
    .foot { padding-top: 2px; }
    .title {
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--muted);
    }
    /* "front" / "back" markers, so the direction of the stack is stated rather
       than inferred. */
    .hint {
        font-size: 11px;
        color: var(--muted);
        margin-left: auto;
    }
    .head .hint::after,
    .foot .hint::before {
        content: '';
        display: inline-block;
        width: 0;
        height: 0;
        margin-left: 5px;
        border-left: 4px solid transparent;
        border-right: 4px solid transparent;
    }
    .head .hint::after { border-bottom: 5px solid var(--muted); }
    .foot .hint::before { border-top: 5px solid var(--muted); margin-right: 5px; margin-left: 0; }

    .layer {
        display: flex;
        align-items: center;
        gap: 2px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--panel-2);
        overflow: hidden;
    }
    .layer.active {
        border-color: var(--accent);
        background: color-mix(in srgb, var(--accent) 12%, var(--panel-2));
    }
    .layer.dragging {
        opacity: 0.85;
        border-color: var(--accent);
        box-shadow: var(--shadow);
    }
    .grip {
        display: flex;
        align-items: center;
        padding: 8px 4px 8px 7px;
        color: var(--muted);
        cursor: grab;
        touch-action: none;
    }
    .layer.dragging .grip { cursor: grabbing; }
    .layer.locked .grip { cursor: default; }
    .pick {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 7px;
        min-width: 0;
        padding: 7px 9px 7px 3px;
        background: none;
        border: none;
        box-shadow: none;
        color: inherit;
        font-size: 13px;
        text-align: left;
    }
    .pick:hover { transform: none; }
    .name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    /* Mobile: the same list, but laid out as a scrolling row of chips. */
    @media (max-width: 859px) {
        .layers {
            flex-direction: row;
            overflow-x: auto;
            gap: 6px;
            padding-bottom: 4px;
        }
        .head, .foot { display: none; }
        .layer { flex: 0 0 auto; }
    }
</style>
