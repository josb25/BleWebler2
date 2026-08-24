<script lang="ts">
    /**
     * Live output preview — the pixels PrintManager.print() would receive, shown
     * on the paper they will actually land on: substrate colour underneath, die
     * line cut out. Renders are debounced to one per animation frame.
     */
    import { DEFAULT_BITMAP_FONT } from 'universal-label-renderer';
    import type { EditorStore } from '../stores/editor.svelte';
    import { paintDesignOnPaper } from '../lib/paper-thumb';
    import type { PrinterSession } from '../printer/session';
    import { fromStore } from 'svelte/store';
    import Icon from './Icon.svelte';
    import { DEFAULT_PAPER_PROFILES } from 'universal-label-core';
    import { globalSettings as settings, DEFAULT_PRINTER_CAPS } from '../stores/settings.svelte';

    interface Props {
        editor: EditorStore;
        session?: PrinterSession;
        /** Hide the threshold slider (e.g. in the print tab's summary). */
        compact?: boolean;
    }
    let { editor, session, compact = false }: Props = $props();

    let canvas = $state<HTMLCanvasElement | null>(null);
    let renderPending = false;
    let renderToken = 0;

    $effect(() => {
        // Track the whole design (deep JSON read keeps this effect subscribed
        // to every nested property).
        void JSON.stringify(editor.design);
        // ...and the paper, whose colour and die line the render now depends on.
        void JSON.stringify(editor.paper ?? null);
        // Reading the binding *here* is what subscribes to it. The render call
        // below happens inside requestAnimationFrame, outside the tracking
        // context, so touching `canvas` there subscribes to nothing — and the
        // first render, which lands before the element is bound, would be the
        // only one ever attempted.
        if (!canvas) return;
        if (renderPending) return;
        renderPending = true;
        requestAnimationFrame(() => {
            renderPending = false;
            void render();
        });
    });

    async function render(): Promise<void> {
        if (!canvas) return;
        const token = ++renderToken;
        try {
            // Rendered *on the loaded paper*: its substrate colour underneath
            // and its die line cut out. A preview of ink floating on a white
            // rectangle is not what will come out of the machine when the roll
            // is yellow and round-cornered.
            const target = canvas;
            await paintDesignOnPaper(target, editor.design, editor.paper);
            if (token !== renderToken || canvas !== target) return;
        } catch (err) {
            console.warn('[PreviewBar] render failed:', err);
        }
    }

    const mmW = $derived(Math.round((editor.design.widthPx / editor.pxPerMm) * 10) / 10);
    const mmH = $derived(Math.round((editor.design.heightPx / editor.pxPerMm) * 10) / 10);

    // svelte-ignore state_referenced_locally
    const printer = session ? fromStore(session) : undefined;
    const caps = $derived((printer ? printer.current.capabilities : undefined) ?? DEFAULT_PRINTER_CAPS[settings.defaultPrinter]);
    
    const paper = $derived(editor.design.paper || DEFAULT_PAPER_PROFILES[0]);
    
    // Calculate visual widths (2x scale for easier viewing)
    const scale = 2;
    const isGap = $derived(paper.type === 'gap' || paper.type === 'perforated');
    const gapWidth = $derived((paper.gapMm || 0) * (caps?.dpmm || 8) * scale);
    const tapeGapMm = $derived(Math.max(0, paper.tapeWidthMm - (paper.labelWidthMm || paper.tapeWidthMm)) / 2);
    const tapeGapPx = $derived(tapeGapMm * (caps?.dpmm || 8) * scale);
    
    const feedBefore = $derived(
        paper.type === 'continuous' 
        ? ((typeof editor.printFeedBeforeMm === 'number'
            ? (editor.printFeedBeforeMm * (caps?.dpmm || 8)) 
            : (caps?.mediaDefaults?.feedBeforeDefaultPx || 0)) * scale) 
        : 0
    );
    const feedAfter = $derived(
        paper.type === 'continuous' 
        ? ((typeof editor.printFeedAfterMm === 'number'
            ? (editor.printFeedAfterMm * (caps?.dpmm || 8)) 
            : (caps?.mediaDefaults?.feedAfterDefaultPx || 0)) * scale) 
        : 0
    );
    const cutterOffset = $derived((caps?.physical?.headToCutterPx || 0) * scale);

    let stripWidth = $state(0);
    const mockupWidthPx = $derived.by(() => {
        const labelW = editor.design.widthPx * scale;
        const tapeW = isGap ? gapWidth + labelW + gapWidth : feedAfter + labelW + feedBefore + cutterOffset;
        return (editor.showAdvancedFeedingPreview ? 0 : 80) + tapeW;
    });
    
    // We only scale down if the mockup exceeds the available width, preserving the 2x scale for small labels.
    const availableWidth = $derived(stripWidth > 40 ? stripWidth - 40 : 0); // 40px for .strip padding
    const fitScale = $derived(availableWidth > 0 && mockupWidthPx > availableWidth ? Math.max(0.1, availableWidth / mockupWidthPx) : 1);
    
    let manualZoom = $state<number | null>(null);
    const effectiveScale = $derived(manualZoom !== null ? manualZoom : fitScale);

    const animDuration = $derived(
        settings.animations === 'none' ? '0s' :
        settings.animations === 'fast' ? '0.5s' : '2s'
    );

    let panX = $state(0);
    let panY = $state(0);
    let gesture = $state<{ startX: number, startY: number, startPanX: number, startPanY: number, pointerId: number } | null>(null);

    function constrainPan(x: number, y: number, zoom: number) {
        const cw = mockupWidthPx * zoom;
        const ch = 280 * zoom;
        
        let nextX = x;
        let nextY = y;
        
        if (cw <= stripWidth) {
            nextX = 0;
        } else {
            const maxX = (cw - stripWidth) / 2 + 32; 
            nextX = Math.max(-maxX, Math.min(maxX, nextX));
        }
        
        if (ch <= 240) {
            nextY = 0;
        } else {
            const maxY = (ch - 240) / 2 + 32;
            nextY = Math.max(-maxY, Math.min(maxY, nextY));
        }
        
        return { x: nextX, y: nextY };
    }

    // Reactively constrain pan if window resizes or zoom changes
    $effect(() => {
        if (stripWidth > 0) {
            const constrained = constrainPan(panX, panY, effectiveScale);
            if (panX !== constrained.x) panX = constrained.x;
            if (panY !== constrained.y) panY = constrained.y;
        }
    });

    function onPointerDown(e: PointerEvent) {
        if (e.button !== 0 && e.button !== 1 && e.pointerType === 'mouse') return;
        gesture = { startX: e.clientX, startY: e.clientY, startPanX: panX, startPanY: panY, pointerId: e.pointerId };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    function onPointerMove(e: PointerEvent) {
        if (gesture && gesture.pointerId === e.pointerId) {
            const nextX = gesture.startPanX + (e.clientX - gesture.startX);
            const nextY = gesture.startPanY + (e.clientY - gesture.startY);
            const constrained = constrainPan(nextX, nextY, effectiveScale);
            panX = constrained.x;
            panY = constrained.y;
        }
    }
    function onPointerUp(e: PointerEvent) {
        if (gesture && gesture.pointerId === e.pointerId) {
            try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch(e) {}
            gesture = null;
        }
    }

    let isReplaying = $state(false);

    function replayAnimation() {
        if (isReplaying) return;
        isReplaying = true;
        setTimeout(() => isReplaying = false, 20); // Small tick to force CSS animation reset
    }

    function wheelAction(node: HTMLElement) {
        function handleWheel(event: WheelEvent) {
            event.preventDefault();
            const zoomDelta = event.deltaY > 0 ? -0.25 : 0.25;
            const newZoom = Math.max(0.25, Math.min(16, effectiveScale + zoomDelta));
            
            if (newZoom !== effectiveScale) {
                const scale = newZoom / effectiveScale;
                const rect = node.getBoundingClientRect();
                const cx = event.clientX - rect.left - rect.width / 2;
                const cy = event.clientY - rect.top - rect.height / 2;
                
                const nextX = cx - (cx - panX) * scale;
                const nextY = cy - (cy - panY) * scale;
                
                const constrained = constrainPan(nextX, nextY, newZoom);
                panX = constrained.x;
                panY = constrained.y;
                manualZoom = newZoom;
            }
        }
        node.addEventListener('wheel', handleWheel, { passive: false });
        return {
            destroy() {
                node.removeEventListener('wheel', handleWheel);
            }
        };
    }

</script>

<div class="preview" style="--anim-duration: {animDuration};">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="strip" bind:clientWidth={stripWidth} use:wheelAction
         onpointerdown={onPointerDown} onpointermove={onPointerMove} onpointerup={onPointerUp} onpointercancel={onPointerUp}>
        <div class="preview-bg"></div>
        <div class="printer-mockup-wrapper" style="transform: translate({panX}px, {panY}px) scale({effectiveScale}); width: 0; height: 0; display: flex; align-items: center; justify-content: center;">
            <div class="printer-mockup" style="width: {mockupWidthPx}px;">
            {#if !editor.showAdvancedFeedingPreview}
                <div class="printer-body">
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <div class="feed-direction" role="button" tabindex="0" title="Replay feed animation" 
                         onpointerdown={(e) => { e.stopPropagation(); replayAnimation(); }}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    </div>
                    <div class="printer-slot"></div>
                </div>
            {/if}
            <div class="tape-container">
                <!-- The physical tape feeding out -->
                <div class="tape-viewport" class:advanced-mode={editor.showAdvancedFeedingPreview}>
                    <!-- Tape always starts exactly behind the lip/cutter (-100%) -->
                    <div class="tape" class:is-gap={isGap} class:no-anim={isReplaying} style="--start-x: -100%; {isGap && tapeGapPx > 0 ? `padding: ${tapeGapPx}px 0;` : ''}">
                        <div class="tape-excess left" style="width: {isGap ? gapWidth : feedAfter}px;" class:is-gap={isGap}></div>
                        
                        <!-- The canvas is masked to the paper's die line; an
                             additional border radius would clip a second shape. -->
                        <div class="label-bounds" title="Printable Area" class:is-gap={isGap}>
                            <canvas bind:this={canvas} style="height: {editor.design.heightPx * scale}px;"></canvas>
                        </div>
                        
                        <div class="tape-excess right" style="width: {isGap ? gapWidth : feedBefore + cutterOffset}px;" class:is-gap={isGap}></div>
                    </div>
                </div>

                <!-- Technical Dimensions Layer (Skizzenbemaßung) -->
                {#if editor.showAdvancedFeedingPreview}
                    <div class="dimensions-layer">
                        
                        <!-- Print Head Marker -->
                        <div class="tech-marker print-head" style="left: 0;">
                            <div class="pointer-up"></div>
                            <div class="tech-label">PRINT HEAD</div>
                        </div>

                        <!-- Feed After Dimension -->
                        {#if !isGap && feedAfter > 0}
                            <div class="tech-dimension" style="left: 0; width: {feedAfter}px;">
                                <div class="dim-text">FEED AFTER</div>
                            </div>
                        {/if}

                        <!-- Cutter Marker -->
                        {#if cutterOffset > 0}
                            <div class="tech-marker cutter" style="left: {cutterOffset}px;">
                                <div class="cut-line"></div>
                                <div class="pointer-up"></div>
                                <div class="tech-label">CUTTER</div>
                            </div>
                        {/if}

                        <!-- Feed Before Dimension -->
                        {#if !isGap && feedBefore > 0}
                            <div class="tech-dimension" style="right: 0; width: {feedBefore}px;">
                                <div class="dim-text">FEED BEFORE</div>
                            </div>
                        {/if}
                        
                    </div>
                {/if}
            </div>
            </div>
        </div>
        
        <div class="zoom-overlay" onpointerdown={(e) => e.stopPropagation()}>
            <button class="zoom-btn" aria-label="Zoom out" onclick={() => manualZoom = Math.max(0.5, effectiveScale - 0.5)}><Icon name="minus" size={16}/></button>
            <span class="zoom-val">{Math.round(effectiveScale * 100) / 100}×</span>
            <button class="zoom-btn" aria-label="Zoom in" onclick={() => manualZoom = Math.min(16, effectiveScale + 0.5)}><Icon name="plus" size={16}/></button>
            <button class="zoom-btn fit" onclick={() => { manualZoom = null; panX = 0; panY = 0; }} title="Fit to Screen">Fit</button>
        </div>
    </div>
    <div class="meta">
        <span>1-bit output · {editor.design.widthPx}×{editor.design.heightPx}px · {mmW}×{mmH}mm</span>
        {#if !compact}
            <label class="threshold">
                Threshold
                <input
                    type="range"
                    min="1"
                    max="254"
                    value={editor.design.threshold}
                    oninput={e => editor.setThreshold(Number(e.currentTarget.value))}
                />
                <span class="val">{editor.design.threshold}</span>
            </label>
        {/if}
    </div>
</div>

<style>
    .preview {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
    .strip {
        padding: 30px 20px;
        background: var(--bg);
        border-bottom: 1px solid var(--border);
        overflow: hidden;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 240px;
        touch-action: none;
        user-select: none;
    }
    .preview-bg {
        position: absolute;
        inset: 0;
        background-image: radial-gradient(var(--border) 1px, transparent 1px);
        background-size: 16px 16px;
        pointer-events: none;
    }
    .printer-mockup-wrapper {
        transition: width 0.1s, height 0.1s;
    }
    .printer-mockup {
        display: flex;
        align-items: center;
        filter: drop-shadow(0 4px 12px rgba(0,0,0,0.1));
    }
    .printer-body {
        width: 80px;
        height: 280px; /* Taller than the 2x scaled tape (up to 240px for 15mm) */
        background: linear-gradient(135deg, #f8fafc, #e2e8f0);
        border: 1px solid #cbd5e1;
        border-right: none;
        border-radius: 12px 0 0 12px;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        position: relative;
        z-index: 2; /* Sits on top of the tape tail */
        box-shadow: inset -4px 0 8px rgba(0,0,0,0.05);
    }
    .feed-direction {
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        margin-right: 12px;
        background: rgba(0, 0, 0, 0.04);
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: rgba(0, 0, 0, 0.3);
        transition: all 0.2s ease;
        padding: 0;
        pointer-events: auto; /* Since printer-body is z-index 2 */
    }
    .feed-direction svg {
        width: 14px;
        height: 14px;
    }
    .feed-direction:hover {
        background: rgba(0, 0, 0, 0.08);
        color: rgba(0, 0, 0, 0.6);
        transform: scale(1.05);
    }
    .feed-direction:active {
        transform: scale(0.95);
    }
    .printer-slot {
        width: 8px;
        height: 250px;
        background: #0f172a;
        border-radius: 4px 0 0 4px;
        box-shadow: inset 2px 0 6px rgba(0,0,0,0.6);
    }
    .tape-container {
        position: relative;
    }
    .tape-viewport {
        overflow: hidden;
        display: flex;
        position: relative;
    }
    .tape-viewport.advanced-mode {
        border-left: 2px solid #333; /* Simulates the printer exit slot in advanced mode */
        margin-left: -2px; /* Offset the 2px border so left: 0 is exactly at the print head */
    }
    .tape {
        display: flex;
        align-items: center;
        background: #ffffff; /* Default continuous tape */
        padding: 8px 0;
        position: relative;
        z-index: 1;
        border-top: 1px solid rgba(0,0,0,0.08);
        border-bottom: 1px solid rgba(0,0,0,0.08);

        /* Rest tucked-in behind the lip so no blank paper shows before the feed
           animation runs; `both` fill applies the 0% (tucked) keyframe up front
           and holds the 100% (fed-out) state afterwards. */
        transform: translateX(var(--start-x, -100%));
        animation: feed-out-initial var(--anim-duration) ease-in-out both;
    }
    .tape::before {
        /* Infinite tail simulating the unprinted roll behind the label */
        content: '';
        position: absolute;
        right: 100%;
        top: -1px; /* Cover the borders */
        bottom: -1px;
        width: 1000px;
        background: inherit;
        border-top: 1px solid rgba(0,0,0,0.08);
        border-bottom: 1px solid rgba(0,0,0,0.08);
    }
    .tape.is-gap {
        background: #e5e7eb; /* Substrate layer color for gap paper */
    }
    .tape.no-anim {
        animation: none !important;
        transform: translateX(var(--start-x, -100%));
    }
    @keyframes feed-out-initial {
        0% { transform: translateX(var(--start-x, -100%)); }
        100% { transform: translateX(0); }
    }
    .tape-excess {
        /* Extra physical tape before/after the printable bounds */
        width: 48px;
        align-self: stretch;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
    }
    /* --- Technical Dimensions (Skizzenbemaßung) --- */
    .dimensions-layer {
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        pointer-events: none;
        z-index: 10;
    }
    .tech-marker {
        position: absolute;
        display: flex;
        flex-direction: column;
        align-items: center;
        transform: translateX(-50%);
    }
    .print-head {
        bottom: -20px;
    }
    .pointer-up {
        width: 0; height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-bottom: 6px solid #10b981;
    }
    .tech-marker .tech-label {
        font-family: monospace;
        font-size: 9px;
        margin-top: 4px;
        font-weight: 600;
        background: rgba(255, 255, 255, 0.9);
        padding: 1px 3px;
        border-radius: 2px;
    }
    .print-head .tech-label { color: #10b981; }

    .cutter {
        top: -10px;
        bottom: -20px;
        justify-content: flex-end;
    }
    .cutter .pointer-up {
        border-bottom-color: #ef4444;
    }
    .cutter .tech-label {
        color: #ef4444;
    }
    .cutter .cut-line {
        position: absolute;
        top: 0;
        bottom: 20px; /* leaves room for pointer and label */
        left: 50%;
        width: 1px;
        border-left: 1px dashed #ef4444;
    }

    .tech-dimension {
        position: absolute;
        bottom: -35px; /* Position of the horizontal dimension line */
        height: 1px;
        background: #64748b; /* slate-500 */
    }
    /* Left extension line */
    .tech-dimension::before {
        content: '';
        position: absolute;
        left: 0;
        bottom: -4px; /* Extends slightly below the dimension line */
        height: 30px; /* Extends up to just below the tape */
        width: 1px;
        background: #64748b;
    }
    /* Right extension line */
    .tech-dimension::after {
        content: '';
        position: absolute;
        right: 0;
        bottom: -4px;
        height: 30px;
        width: 1px;
        background: #64748b;
    }
    .tech-dimension .dim-text {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(255, 255, 255, 0.9);
        padding: 2px 4px;
        font-size: 9px;
        font-family: monospace;
        color: #334155;
        border-radius: 2px;
    }
    .label-bounds {
        box-sizing: content-box;
    }
    /* The canvas carries the substrate colour and follows the die line. */
    .label-bounds.is-gap {
        background: transparent;
        filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.18));
    }
    canvas {
        display: block;
        image-rendering: pixelated;
        /* The canvas contains the finished picture, including paper colour. */
        max-width: none;
        width: auto;
    }
    .meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        color: var(--muted);
        font-size: 12px;
        padding: 0 4px;
    }
    .zoom-overlay {
        position: absolute;
        bottom: 16px;
        right: 16px;
        display: flex;
        align-items: center;
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 4px;
        box-shadow: var(--shadow);
        z-index: 10;
        transition: box-shadow 0.2s ease, transform 0.2s ease;
    }
    .zoom-overlay:hover {
        box-shadow: var(--shadow-hover);
        transform: translateY(-2px);
    }
    .zoom-btn {
        background: transparent;
        border: none;
        color: var(--text);
        min-height: 28px;
        padding: 4px 8px;
        font-size: 14px;
        cursor: pointer;
        border-radius: 8px;
        transition: background 0.2s ease;
    }
    .zoom-btn:hover {
        background: var(--bg);
        transform: none;
        box-shadow: none;
    }
    .zoom-btn:active {
        transform: scale(0.92);
    }
    .zoom-btn.fit {
        font-size: 13px;
        border-left: 1px solid var(--border);
        margin-left: 4px;
        border-radius: 0 8px 8px 0;
    }
    .zoom-val {
        min-width: 40px;
        text-align: center;
        font-variant-numeric: tabular-nums;
        font-size: 13px;
        color: var(--text);
    }
    .threshold {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .threshold input {
        width: 140px;
    }
    .val {
        min-width: 28px;
        font-variant-numeric: tabular-nums;
    }
</style>
