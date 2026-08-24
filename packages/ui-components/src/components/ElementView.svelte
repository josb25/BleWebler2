<script lang="ts">
    /**
     * One element on the editor canvas, drawn as two overlaid layers:
     *
     *  - the **bitmap**, positioned on the element's axis-aligned bounding box.
     *    It is rendered already-rotated by the same code that feeds the printer,
     *    so it carries no CSS transform — a CSS rotation would resample the
     *    finished 1-bit image and soften every edge.
     *  - the **frame**: the element's own rectangle, rotated with it. It is
     *    transparent and carries the selection outline, the handles and all
     *    hit-testing, so the box you grab is the box you see turning.
     *
     * Splitting them is what lets the outline rotate while the pixels stay hard.
     * All gesture logic lives in EditorCanvas; this only reports pointer-downs.
     */
    import type { AnyElement, LabelDesign } from 'universal-label-renderer';
    import { rotatedBounds } from 'universal-label-renderer';
    import { domMeasureText } from 'universal-label-renderer';
    import { rasterizeElementPreview } from 'universal-label-renderer';

    interface Props {
        element: AnyElement;
        design: LabelDesign;
        zoom: number;
        selected: boolean;
        onpointerdownelement: (event: PointerEvent, element: AnyElement) => void;
        onpointerdownhandle: (event: PointerEvent, element: AnyElement) => void;
        onpointerdownrotate: (event: PointerEvent, element: AnyElement, center: { x: number; y: number }) => void;
    }

    let { element, design, zoom, selected, onpointerdownelement, onpointerdownhandle, onpointerdownrotate }: Props = $props();

    let frameDiv = $state<HTMLDivElement | null>(null);

    let img = $state<HTMLCanvasElement | null>(null);
    let renderToken = 0;

    const bounds = $derived(rotatedBounds(element, domMeasureText));

    // Re-render the preview when content changes — position is excluded so
    // dragging never re-rasterizes.
    const contentKey = $derived(JSON.stringify({ ...element, x: 0, y: 0 }) + '@' + design.threshold);

    $effect(() => {
        void contentKey;
        const token = ++renderToken;
        rasterizeElementPreview(element, design)
            .then(canvas => {
                if (token === renderToken) img = canvas as HTMLCanvasElement;
            })
            .catch(err => console.warn('[ElementView] preview failed:', err));
    });

    /** The already-rotated bitmap sits on the bounding box. */
    const bitmapStyle = $derived(
        `left:${bounds.x * zoom}px;top:${bounds.y * zoom}px;` +
        `width:${bounds.width * zoom}px;height:${bounds.height * zoom}px;`
    );

    /** The frame is the element's own rectangle, turned with it. */
    const frameStyle = $derived(
        `left:${element.x * zoom}px;top:${element.y * zoom}px;` +
        `width:${bounds.contentW * zoom}px;height:${bounds.contentH * zoom}px;` +
        (element.rotation ? `transform:rotate(${element.rotation}deg);` : '')
    );

    function startRotate(e: PointerEvent): void {
        e.stopPropagation();
        const r = frameDiv?.getBoundingClientRect();
        // Rotation preserves the box centre, so the rect centre is the pivot.
        const center = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: e.clientX, y: e.clientY };
        onpointerdownrotate(e, element, center);
    }
</script>

<!-- Bitmap layer: never receives pointers, so hit-testing follows the rotated
     frame below rather than this element's larger bounding box. -->
<div class="bitmap" style={bitmapStyle}>
    {#if img}
        <!-- svelte-ignore a11y_missing_attribute -->
        <img src={img.toDataURL()} draggable="false" />
    {/if}
</div>

<!-- svelte-ignore a11y_no_static_element_interactions -- canvas objects are
     pointer-driven; selection/nudge/delete have app-level keyboard bindings -->
<div
    bind:this={frameDiv}
    class="frame"
    class:selected
    class:locked={element.locked}
    class:invalid={bounds.error !== undefined}
    style={frameStyle}
    title={bounds.error}
    onpointerdown={e => onpointerdownelement(e, element)}
>
    {#if selected && !element.locked}
        <!-- svelte-ignore a11y_no_static_element_interactions -- resize is a
             pointer-only affordance; sizes are keyboard-editable in the panel -->
        <div
            class="handle"
            onpointerdown={e => {
                e.stopPropagation();
                onpointerdownhandle(e, element);
            }}
        ></div>
        <!-- svelte-ignore a11y_no_static_element_interactions -- rotate is a
             pointer-only affordance; the angle is also editable in the panel -->
        <div class="rotate-handle" title="Rotate" onpointerdown={startRotate}></div>
    {/if}
</div>

<style>
    .bitmap {
        position: absolute;
        pointer-events: none;
    }
    .bitmap img {
        width: 100%;
        height: 100%;
        image-rendering: pixelated;
        user-select: none;
        -webkit-user-drag: none;
        display: block;
    }
    .frame {
        position: absolute;
        touch-action: none;
        cursor: grab;
    }
    .frame.selected {
        outline: 2px solid var(--accent);
        outline-offset: 1px;
    }
    .frame.locked {
        cursor: default;
    }
    .frame.locked.selected {
        outline-style: dashed;
    }
    .frame.invalid {
        outline: 2px dashed var(--danger);
    }
    .handle {
        position: absolute;
        right: -12px;
        bottom: -12px;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: var(--accent);
        border: 2px solid #fff;
        box-shadow: 0 1px 3px rgb(0 0 0 / 40%);
        cursor: nwse-resize;
        touch-action: none;
    }
    .rotate-handle {
        position: absolute;
        left: 50%;
        top: -26px;
        width: 18px;
        height: 18px;
        margin-left: -9px;
        border-radius: 50%;
        background: #fff;
        border: 2px solid var(--accent);
        box-shadow: 0 1px 3px rgb(0 0 0 / 40%);
        cursor: grab;
        touch-action: none;
    }
    /* Little stem connecting the rotate handle to the element's top edge. */
    .rotate-handle::after {
        content: '';
        position: absolute;
        left: 50%;
        top: 100%;
        width: 2px;
        height: 8px;
        margin-left: -1px;
        background: var(--accent);
    }
</style>
