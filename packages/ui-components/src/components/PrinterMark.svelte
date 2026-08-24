<script lang="ts">
    /**
     * A printer, drawn small.
     *
     * {@link PrinterArtworkView} is the *exhibit* — controls, colourway picker,
     * movements you can play. This is the opposite: no controls, no
     * interaction, just the drawing at whatever size the surrounding UI has
     * room for. It is what lets the same artwork appear in a status chip, a
     * connect row and a settings list without each of those growing a copy of
     * the sizing and hook-writing logic.
     *
     * Two things stop a shrunk-down drawing from looking wrong:
     *
     * - **Optical stroke weight.** The artwork's outline is measured in its own
     *   user units, sized for a picture ~110 units wide. Displayed at 24 px
     *   that stroke lands at a fifth of a pixel and the printer dissolves into
     *   a grey smudge. So the outline is re-expressed as a constant *screen*
     *   weight, which is how an icon is drawn by hand too.
     * - **Its own aspect ratio.** The P12 is tall and narrow, the P50 nearly
     *   square. Both fit inside a square box rather than being stretched to
     *   fill one, because the silhouette is the thing being recognised.
     */
    import { onDestroy } from 'svelte';
    import {
        sampleAnimation,
        type PrinterArtwork,
        type PrinterColourway,
        type LedColourName
    } from 'universal-label-core';

    interface Props {
        artwork: PrinterArtwork;
        /** Box the drawing fits inside, in px. */
        size?: number;
        /**
         * Play one of the driver's movements while the pointer is over the
         * drawing. `true` picks the first movement the artwork declares; a
         * string names one.
         *
         * Off by default, and meant only for the larger instances. At chip or
         * thumbnail size the travel is a pixel or two — too small to read as
         * movement, and a list of them twitching under the cursor is noise
         * rather than character.
         */
        hoverAnimation?: string | boolean;
        /**
         * Which LED is lit. The driver publishes what each colour *means*, so a
         * caller passing `'blue'` on a connected printer is showing the state
         * the real machine would be showing.
         */
        led?: LedColourName | 'off';
        colourway?: PrinterColourway | null;
        /** Outline weight in screen px. Heavier reads better at chip sizes. */
        strokePx?: number;
        /** Accessible name. Omit where the drawing repeats adjacent text. */
        title?: string;
    }
    let {
        artwork,
        size = 24,
        led = 'off',
        colourway = null,
        strokePx = 0.9,
        hoverAnimation = false,
        title
    }: Props = $props();

    const movement = $derived.by(() => {
        if (!hoverAnimation) return null;
        const all = Object.values(artwork.animations);
        if (typeof hoverAnimation === 'string') {
            return artwork.animations[hoverAnimation] ?? null;
        }
        return all[0] ?? null;
    });

    /**
     * Whether the movement says anything about the LED. Most do not — a cut is
     * a blade travelling, and the lamp is reporting an unrelated condition. If
     * the animation is silent on the subject, the caller's `led` has to survive
     * playback untouched: sampling would hand back `'off'` for every frame and
     * a connected printer would go dark for the duration of a hover.
     */
    const movesLed = $derived(
        movement?.keyframes.some(k => k.led !== undefined) ?? false
    );

    /** Live position while playing; `null` means at rest. */
    let frameCutterMm = $state<number | null>(null);
    let frameLed = $state<LedColourName | 'off' | null>(null);
    let raf = 0;

    function stop(): void {
        cancelAnimationFrame(raf);
        raf = 0;
        // Back to rest rather than frozen mid-travel: a cutter halfway through
        // its stroke depicts a jammed machine. Instant, because the pointer
        // leaving is not itself a movement of the mechanism.
        frameCutterMm = null;
        frameLed = null;
    }

    function start(): void {
        const m = movement;
        if (!m || raf) return;
        // Reduced motion means no motion, not a faster one. The drawing is
        // still complete and still says what the part is.
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
        const begin = performance.now();
        const step = (now: number) => {
            // Loops for as long as the pointer stays. Every movement in the
            // driver returns to rest, so the seam is invisible.
            const t = ((now - begin) % m.durationMs) / m.durationMs;
            const at = sampleAnimation(m, t);
            frameCutterMm = at.cutterMm;
            if (movesLed) frameLed = at.led;
            raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
    }

    onDestroy(stop);

    const litColour = $derived.by(() => {
        const part = artwork.parts.led;
        if (!part) return null;
        const shown = frameLed ?? led;
        return shown === 'off' ? part.unlit : part.colours[shown];
    });

    /**
     * Hooks as inline custom properties. Set on the wrapper rather than the SVG
     * because custom properties inherit — which means this works without
     * reaching into `{@html}`-rendered content after the fact.
     */
    const style = $derived.by(() => {
        const h = artwork.hooks;
        const [vw] = artwork.viewBox;
        const parts = [
            `--mark-size:${size}px`,
            // Units per screen pixel × the weight we want to see.
            `${h.outline}:${((vw / size) * strokePx).toFixed(2)}`
        ];
        if (colourway) parts.push(`${h.bodyColour}:${colourway.body}`);
        if (colourway?.cutter && h.cutterColour) parts.push(`${h.cutterColour}:${colourway.cutter}`);
        if (litColour && h.led) parts.push(`${h.led}:${litColour}`);
        if (movement) {
            // Whoever drives the position owns the easing, and this component
            // drives every frame itself. Left on, the artwork's default 350 ms
            // ease would restart on each frame and smear the stroke into a
            // drift — and, worse, would glide the cutter home after the pointer
            // leaves. Movement on leaving is exactly what a hover effect must
            // not do: the mechanism is at rest the moment you look away.
            parts.push('--printer-cutter-ease:0s');
        }
        if (frameCutterMm !== null && h.cutterPositionMm) {
            parts.push(`${h.cutterPositionMm}:${frameCutterMm.toFixed(2)}`);
        }
        return parts.join(';');
    });
</script>

<!-- The SVG carries its own `role="img"` and label, so without a `title` the
     drawing would be announced on top of the text it sits beside — "Marklife
     P12 image, P12: connected". Hiding the wrapper hides that whole subtree. -->
<span
    class="mark"
    style={style}
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : 'true'}
    onpointerenter={movement ? start : undefined}
    onpointerleave={movement ? stop : undefined}
>
    {@html artwork.svg}
</span>

<style>
    .mark {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--mark-size);
        height: var(--mark-size);
        flex: none;
    }

    /* `width:auto` lets the intrinsic ratio survive; the maxima do the fitting.
       Without both, an SVG carrying width/height attributes ignores the box. */
    .mark :global(svg) {
        display: block;
        width: auto;
        height: auto;
        max-width: 100%;
        max-height: 100%;
    }
</style>
