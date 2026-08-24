<script lang="ts">
    /**
     * What a roll of this media actually looks like, drawn from the profile and
     * nothing else.
     *
     * The print preview answers "what will this label say"; this answers "what
     * am I about to load", which is a different question and the one you have
     * when picking paper. So there is deliberately no design on it: every mark
     * here comes from a field of the {@link PaperProfile}, which also makes it a
     * check on the profile — a gap or corner radius typed in wrong is visible
     * here rather than after a failed print.
     *
     * Drawn in millimetres and scaled at the end, so the geometry code never
     * has to think about pixels or device resolution.
     */
    import type { PaperProfile } from 'universal-label-core';
    import { dieWithHoles, luminance } from 'universal-label-renderer';

    interface Props {
        paper: PaperProfile;
        /** Rendered pixels per millimetre. Display only — unrelated to printer dpmm. */
        scale?: number;
        /** Feed direction across the view. Rolls read naturally left-to-right. */
        length?: number;
        /** Draw the dimension callouts. Off in compact list rows. */
        annotate?: boolean;
    }
    let { paper, scale = 3, length = 74, annotate = true }: Props = $props();

    const tapeW = $derived(Math.max(1, paper.tapeWidthMm));
    /** Continuous stock has no pitch — it is drawn as one unbroken run. */
    const isSegmented = $derived(paper.labelLengthMm !== undefined && paper.labelLengthMm > 0);
    const labelLen = $derived(paper.labelLengthMm ?? 0);
    const gap = $derived(paper.gapMm ?? 0);
    const pitch = $derived(labelLen + gap);
    /** Die-cut labels can be narrower than the liner they sit on. */
    const labelW = $derived(Math.min(tapeW, paper.labelWidthMm ?? tapeW));
    const inset = $derived((tapeW - labelW) / 2);

    /**
     * The die outline, shared with the print-time mask.
     *
     * Drawn in label space (the sticker upright), so it needs placing onto the
     * web: rotated if the stock is mounted sideways, then scaled from
     * millimetres to view units.
     */
    const dieGeometry = $derived(dieWithHoles(paper));
    const dieScale = $derived(scale);
    const dieTransform = $derived.by(() => {
        const rot = paper.mountRotationDeg ?? 0;
        const s = `scale(${scale})`;
        if (rot === 90) return `translate(${labelLen * scale} 0) rotate(90) ${s}`;
        if (rot === 270) return `translate(0 ${labelW * scale}) rotate(-90) ${s}`;
        if (rot === 180) return `translate(${labelLen * scale} ${labelW * scale}) rotate(180) ${s}`;
        return s;
    });

    /**
     * The run actually drawn, in mm.
     *
     * Snapped to a whole number of pitches on segmented stock. Drawing a fixed
     * mm length instead left the last label sliced at whatever point the run
     * happened to end — one full label and a random sliver, which reads as a
     * rendering fault rather than as a roll continuing. At least one whole
     * label, always.
     */
    const runMm = $derived.by(() => {
        if (!isSegmented || pitch <= 0) return length;
        return Math.max(1, Math.round(length / pitch)) * pitch;
    });

    /** Where each label starts along the feed. */
    const starts = $derived.by(() => {
        if (!isSegmented || pitch <= 0) return [];
        const out: number[] = [];
        for (let x = 0; x + labelLen <= runMm + 0.001; x += pitch) out.push(x);
        return out;
    });

    /**
     * Substrate colour. Falls back per media type so a transparent or black roll
     * does not draw as plain white paper — the point of the preview is that you
     * recognise the roll in your hand.
     */
    const base = $derived.by(() => {
        // A declared colourway wins: the same die is sold in white, yellow and
        // blue, and the profile is the only thing that knows which one is loaded.
        const declared = paper.appearance?.baseColor ?? paper.appearance?.colorways?.[0]?.color;
        if (declared) return declared;
        if (paper.type === 'black') return '#26272b';
        if (paper.type === 'transparent') return 'rgba(255,255,255,0.10)';
        if (paper.type === 'heat-shrink') return '#e8e6e1';
        if (paper.type === 'pvc') return '#f2f4f6';
        return '#ffffff';
    });
    /** The outline colour, kept legible against whatever the substrate is. */
    const inkOnBase = $derived(luminance(base) < 0.4 ? '#e9e9ec' : '#111111');

    /**
     * The liner: the backing the labels are stuck to, which is a different
     * material from the labels themselves.
     *
     * On continuous stock there is no distinction — the web *is* the label, so
     * it takes the substrate colour. On die-cut stock it must not: painting the
     * whole web in the label's colour makes a yellow roll look like yellow
     * backing paper, and hides the very thing the die line is there to show.
     * Glassine backing is a pale neutral whatever colour the labels are.
     */
    const liner = $derived(isSegmented ? '#e7e4dd' : base);
    /** Ticks and marks drawn on the liner, not on a label. */
    const inkOnLiner = $derived(luminance(liner) < 0.4 ? '#e9e9ec' : '#111111');

    const w = $derived(runMm * scale);
    const h = $derived(tapeW * scale);

    /**
     * Padding per side, not one value.
     *
     * The tape-width callout is right-aligned text sitting *outside* the left
     * edge, so it needs room proportional to how long "125 mm" is — a single
     * symmetric pad clipped it to its last letter. The other sides only ever
     * hold a short line of text or nothing at all.
     */
    const padL = $derived(annotate ? 52 : 4);
    const padR = $derived(annotate ? 10 : 4);
    const padT = $derived(annotate ? 16 : 4);
    const padB = $derived(annotate ? 22 : 4);
</script>

<div class="paper-preview">
    <svg
        viewBox="{-padL} {-padT} {w + padL + padR} {h + padT + padB}"
        width={w + padL + padR}
        height={h + padT + padB}
        role="img"
        aria-label="{paper.name}: {tapeW} mm {isSegmented ? `tape, ${labelLen} mm labels` : 'continuous tape'}"
    >
        <defs>
            <!-- Transparent stock reads as transparent only against something. -->
            <pattern id="checker-{paper.id}" width="8" height="8" patternUnits="userSpaceOnUse">
                <rect width="8" height="8" fill="var(--panel-2)" />
                <rect width="4" height="4" fill="var(--panel)" />
                <rect x="4" y="4" width="4" height="4" fill="var(--panel)" />
            </pattern>
        </defs>

        <!-- Transparent *continuous* stock is see-through across the whole web.
             Die-cut transparent stock is see-through only where the labels are,
             so its checker is drawn per label instead. -->
        {#if paper.type === 'transparent' && !isSegmented}
            <rect x="0" y="0" width={w} height={h} fill="url(#checker-{paper.id})" />
        {/if}

        <!-- The web. On die-cut stock this is the *liner* — backing paper, a
             different material from the labels on it — so it deliberately does
             not take the label's colour. -->
        <rect x="0" y="0" width={w} height={h} fill={liner} stroke="var(--border)" stroke-width="1" />

        {#if isSegmented}
            {#each starts as x (x)}
                <!--
                    The die comes from the shared geometry, not from a rounded
                    rect drawn here. An ellipse, a T-shaped cable flag or a
                    traced silhouette all arrive as the same path, and the mask
                    used when rendering a label cuts exactly this outline — a
                    preview that disagreed with it would look right and print
                    wrong.
                -->
                <g transform="translate({x * scale} {inset * scale}) {dieTransform}">
                    <path
                        d={dieGeometry.d}
                        fill-rule={dieGeometry.fillRule}
                        fill={paper.type === 'transparent' ? `url(#checker-${paper.id})` : base}
                        stroke={inkOnBase}
                        stroke-opacity="0.35"
                        stroke-width={1 / dieScale}
                        vector-effect="non-scaling-stroke"
                    />
                </g>
            {/each}
            <!--
                The gaps between labels are drawn with nothing at all.

                They are bare liner — exactly the same material as the margin
                above and below a narrow label. Tinting one and not the other
                made two views of the same backing paper look like two different
                things. The die outlines already say where each label stops, and
                the dimension callout names the pitch.
            -->

        {:else if paper.type === 'black-mark'}
            <!-- No die line, but the timing marks on the back still set a pitch. -->
            {#each [0.25, 0.6, 0.95] as f (f)}
                <rect x={f * w} y={h - 4} width={Math.max(3, 2 * scale)} height="4" fill={inkOnLiner} opacity="0.7" />
            {/each}
        {/if}

        {#if annotate}
            <!-- Tape width, across the web. -->
            <line x1="-6" y1="0" x2="-6" y2={h} stroke="var(--muted)" stroke-width="1" />
            <text x="-9" y={h / 2} class="dim" text-anchor="end" dominant-baseline="middle">{tapeW} mm</text>
            {#if isSegmented}
                <line x1="0" y1={h + 6} x2={labelLen * scale} y2={h + 6} stroke="var(--muted)" stroke-width="1" />
                <text x={(labelLen * scale) / 2} y={h + 16} class="dim" text-anchor="middle">{labelLen} mm</text>
                {#if gap > 0}
                    <text x={(labelLen + gap / 2) * scale} y="-6" class="dim" text-anchor="middle">{gap} mm gap</text>
                {/if}
            {:else}
                <text x={w / 2} y={h + 16} class="dim" text-anchor="middle">continuous</text>
            {/if}
        {/if}
    </svg>
</div>

<style>
    .paper-preview {
        display: inline-flex;
        overflow-x: auto;
        max-width: 100%;
    }
    svg {
        flex: none;
    }
    .dim {
        font-size: 10px;
        fill: var(--muted);
    }
</style>
