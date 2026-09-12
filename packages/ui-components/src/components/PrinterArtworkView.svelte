<script lang="ts">
    /**
     * Renders a printer's artwork and plays the movements its driver declares.
     *
     * This is the UI half of the split. The driver says *what* the machine does
     * — a cut is the blade travelling 4 mm down and returning, over 700 ms —
     * and this decides how that is expressed: it steps the animation with rAF,
     * writes the CSS custom properties the SVG publishes, and honours
     * `prefers-reduced-motion` by jumping straight to the end state instead of
     * refusing to show anything.
     *
     * Nothing here knows the shape of a cutter or where the LED sits. It reads
     * `artwork.parts` to decide which controls exist and `artwork.hooks` for
     * the property names, so a printer added to the driver tomorrow gets the
     * same controls with no change to this file.
     */
    import { onDestroy } from 'svelte';
    import {
        sampleAnimation,
        type PrinterArtwork,
        type ArtworkAnimation,
        type PrinterColourway
    } from 'universal-label-core';

    interface Props {
        artwork: PrinterArtwork;
        label: string;
    }
    let { artwork, label }: Props = $props();

    let host = $state<HTMLDivElement | null>(null);
    let playing = $state<string | null>(null);
    let cutterMm = $state(0);
    let led = $state<string>('off');
    /**
     * Which colourway is shown. A variant of the physical product, not a state
     * the printer is in, so it sits apart from the LED and the cutter position.
     */
    let selectedColourwayId = $state<string | null>(null);
    const colourway = $derived(
        artwork.colourways?.find(way => way.id === selectedColourwayId)
            ?? artwork.colourways?.[0]
            ?? null
    );

    let frame = 0;
    const animations = $derived(Object.values(artwork.animations));
    const ledColours = $derived(artwork.parts.led?.colours ?? {});

    function apply(mm: number, colour: string): void {
        if (!host) return;
        const svg = host.querySelector('svg');
        if (!svg) return;
        // Every hook is optional except the two every artwork has, so each write
        // is guarded: a model with no cutter publishes no cutter property, and
        // setting `undefined` as a property name would throw.
        const h = artwork.hooks;
        if (h.cutterPositionMm) svg.style.setProperty(h.cutterPositionMm, String(mm));
        const lit = colour === 'off' ? (artwork.parts.led?.unlit ?? '') : (ledColours as Record<string, string>)[colour];
        if (h.led && lit) svg.style.setProperty(h.led, lit);
        if (colourway) {
            svg.style.setProperty(h.bodyColour, colourway.body);
            if (h.cutterColour && colourway.cutter) {
                svg.style.setProperty(h.cutterColour, colourway.cutter);
            }
        }
    }

    function stop(): void {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        playing = null;
    }

    function play(anim: ArtworkAnimation): void {
        stop();
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (reduced) {
            // Show the outcome rather than the journey. For a movement that
            // returns to rest that means the resting state, which is correct:
            // the point of `returnsToRest` is that there is nothing to see
            // afterwards.
            const end = sampleAnimation(anim, 1);
            cutterMm = end.cutterMm;
            led = end.led;
            apply(cutterMm, led);
            return;
        }
        playing = anim.id;
        const started = performance.now();
        const step = (now: number) => {
            const t = Math.min(1, (now - started) / anim.durationMs);
            const at = sampleAnimation(anim, t);
            cutterMm = at.cutterMm;
            led = at.led;
            apply(cutterMm, led);
            if (t < 1) frame = requestAnimationFrame(step);
            else stop();
        };
        frame = requestAnimationFrame(step);
    }

    function setColourway(c: PrinterColourway): void {
        selectedColourwayId = c.id;
        apply(cutterMm, led);
    }

    // Re-apply whenever the artwork is swapped in, so a freshly mounted SVG
    // starts from the state shown in the controls rather than from its own
    // defaults.
    $effect(() => {
        void artwork;
        apply(cutterMm, led);
    });

    onDestroy(stop);
</script>

<div class="artwork">
    <div class="stage" bind:this={host}>
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- the SVG comes
             from the driver package, not from user input. -->
        {@html artwork.svg}
    </div>

    <div class="controls">
        {#if animations.length > 0}
            <div class="group">
                <span class="group-label">Actions</span>
                <div class="row">
                    {#each animations as anim (anim.id)}
                        <button class="act" class:on={playing === anim.id} onclick={() => play(anim)}>
                            {anim.label}
                            <small>{anim.durationMs} ms</small>
                        </button>
                    {/each}
                </div>
            </div>
        {/if}

        {#if artwork.parts.cutter}
            {@const c = artwork.parts.cutter}
            <div class="group">
                <span class="group-label">
                    Cutter <small>{c.lengthMm} mm · {c.travelUpMm} up / {c.travelDownMm} down</small>
                </span>
                <input
                    type="range" min={-c.travelUpMm} max={c.travelDownMm} step="0.1"
                    value={cutterMm}
                    oninput={e => { stop(); cutterMm = Number(e.currentTarget.value); apply(cutterMm, led); }}
                />
                <span class="readout">{cutterMm.toFixed(1)} mm</span>
            </div>
        {/if}

        {#if artwork.colourways?.length}
            <div class="group">
                <span class="group-label">Colourway</span>
                <!-- Real pairings, not two colour pickers: body and cutter are
                     moulded separately but only ship in these combinations. -->
                <div class="ways">
                    {#each artwork.colourways as way (way.id)}
                        <button
                            class="way" class:on={colourway?.id === way.id}
                            title={way.label}
                            onclick={() => setColourway(way)}
                        >
                            <span class="chip">
                                <span class="chip-body" style="background:{way.body}"></span>
                                {#if way.cutter}
                                    <span class="chip-cutter" style="background:{way.cutter}"></span>
                                {/if}
                            </span>
                            {way.label}
                        </button>
                    {/each}
                </div>
            </div>
        {/if}

        {#if artwork.parts.led}
            <div class="group">
                <span class="group-label">
                    Status LED <small>single-colour SMD</small>
                </span>
                <!-- Each colour is a *condition the printer is in*, not a step
                     in any movement, so these are states with meanings rather
                     than buttons that do something. -->
                <div class="states">
                    <button class="state" class:on={led === 'off'}
                        onclick={() => { stop(); led = 'off'; apply(cutterMm, led); }}>
                        <span class="dot off"></span>
                        <span class="state-text"><strong>Off</strong></span>
                    </button>
                    {#each Object.entries(ledColours) as [nameKey, hex] (nameKey)}
                        <button
                            class="state" class:on={led === nameKey}
                            onclick={() => { stop(); led = nameKey; apply(cutterMm, led); }}
                        >
                            <span class="dot" style="background:{hex}"></span>
                            <span class="state-text">
                                <strong>{nameKey}</strong>
                                {#if artwork.ledStates?.[nameKey as keyof typeof artwork.ledStates]}
                                    <small>{artwork.ledStates[nameKey as keyof typeof artwork.ledStates]}</small>
                                {/if}
                            </span>
                        </button>
                    {/each}
                </div>
            </div>
        {/if}

        <!-- Only worth saying where something actually moves. On a printer with
             no cutter and no named movements the sentence describes controls
             that are not on the page. -->
        {#if animations.length || artwork.parts.cutter}
            <p class="note">
                Movements and travel come from the {label} driver; this page only plays them.
            </p>
        {:else}
            <p class="note">
                Artwork and colourways come from the {label} driver. This model has
                no moving parts to show.
            </p>
        {/if}
    </div>
</div>

<style>
    .artwork { display: flex; flex-direction: column; gap: 14px; }
    .stage {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: var(--panel-2);
        border: 1px solid var(--border);
        border-radius: 3px;
        min-height: 190px;
    }
    .stage :global(svg) { width: 130px; height: auto; }
    .controls { display: flex; flex-direction: column; gap: 12px; }
    .group { display: flex; flex-direction: column; gap: 6px; }
    .group-label {
        font-family: var(--mono);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--muted);
    }
    .group-label small { text-transform: none; letter-spacing: 0; }
    .row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .act {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 1px;
        padding: 5px 10px;
        min-height: 0;
        border: 1px solid var(--border);
        border-radius: 5px;
        background: var(--panel);
        font-size: 13px;
        box-shadow: none;
    }
    .act small { color: var(--muted); font-family: var(--mono); font-size: 10px; }
    .act:hover { transform: none; border-color: var(--accent); }
    .act.on { border-color: var(--accent); color: var(--accent); }
    .readout { font-family: var(--mono); font-size: 12px; color: var(--muted); }
    input[type='range'] { width: 100%; accent-color: var(--accent); }
    .ways { display: flex; flex-direction: column; gap: 4px; }
    .way {
        display: flex; align-items: center; gap: 8px;
        padding: 4px 9px; min-height: 0; width: 100%;
        border: 1px solid var(--border); border-radius: 5px;
        background: var(--panel); font-size: 12px; box-shadow: none;
        text-align: left;
    }
    .way:hover { transform: none; border-color: var(--accent); }
    .way.on { border-color: var(--accent); }
    /* Body and cutter shown as one chip, because that is how they ship. */
    .chip {
        flex: 0 0 auto; display: inline-flex;
        width: 26px; height: 14px; border-radius: 3px; overflow: hidden;
        border: 1px solid var(--border);
    }
    .chip-body { flex: 1; }
    .chip-cutter { width: 7px; }
    .states { display: flex; flex-direction: column; gap: 4px; }
    .state {
        display: flex; align-items: center; gap: 8px;
        padding: 5px 9px; min-height: 0; width: 100%;
        border: 1px solid var(--border); border-radius: 5px;
        background: var(--panel); font-size: 12px; box-shadow: none;
        text-align: left;
    }
    .state:hover { transform: none; border-color: var(--accent); }
    .state.on { border-color: var(--accent); }
    .state-text { display: flex; flex-direction: column; gap: 0; min-width: 0; }
    .state-text strong { font-weight: 600; text-transform: capitalize; }
    .state-text small { color: var(--muted); font-size: 11px; }
    .dot {
        flex: 0 0 auto;
        width: 10px; height: 10px; border-radius: 50%; display: inline-block;
        border: 1px solid rgb(0 0 0 / 15%);
    }
    .dot.off { background: var(--panel-2); }
    .note { margin: 0; font-size: 11px; color: var(--muted); }
</style>
