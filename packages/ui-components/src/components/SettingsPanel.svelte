<script lang="ts">
    import { globalSettings as settings, PRINTER_PROFILES, type SkinOption } from '../stores/settings.svelte';
    import PrinterMark from './PrinterMark.svelte';
    import Icon from './Icon.svelte';
    import { artworkFor } from '../data/artwork';

    const chosen = $derived(PRINTER_PROFILES.find(p => p.id === settings.defaultPrinter));
    const chosenArtwork = $derived(chosen ? artworkFor(chosen) : undefined);
    const chosenLabel = $derived(chosen ? `${chosen.brand} ${chosen.model}` : 'No printer model');
    const chosenDetail = $derived.by(() => {
        if (!chosen) return 'Raw continuous data — no physical dimensions assumed';
        const c = chosen.capabilities;
        return `${c.canvasHeightPx}px head · ${c.dpmm} dpmm`;
    });

    function updateTheme(theme: 'system' | 'light' | 'dark') {
        settings.theme = theme;
        settings.save();
    }

    function updateSkin(skin: SkinOption) {
        settings.skin = skin;
        settings.save();
    }

    function updateAnimations(anim: 'normal' | 'fast' | 'none') {
        settings.animations = anim;
        settings.save();
    }

    function updateDefaultPrinter(event: Event) {
        const select = event.target as HTMLSelectElement;
        settings.defaultPrinter = select.value as any;
        settings.save();
    }
</script>

<div class="settings">
    <section>
        <h3>Theme</h3>
        <div class="options">
            <label class="radio-label">
                <input type="radio" name="theme" value="system" checked={settings.theme === 'system'} onchange={() => updateTheme('system')} />
                System
            </label>
            <label class="radio-label">
                <input type="radio" name="theme" value="light" checked={settings.theme === 'light'} onchange={() => updateTheme('light')} />
                Light
            </label>
            <label class="radio-label">
                <input type="radio" name="theme" value="dark" checked={settings.theme === 'dark'} onchange={() => updateTheme('dark')} />
                Dark
            </label>
        </div>
    </section>

    <section>
        <h3>Style</h3>
        <p class="hint">Independent of light/dark — both styles work in either.</p>
        <div class="skins">
            <button
                class="skin"
                class:on={settings.skin === 'tech'}
                aria-pressed={settings.skin === 'tech'}
                onclick={() => updateSkin('tech')}
            >
                <span class="swatch tech" aria-hidden="true"></span>
                <span class="skin-text">
                    <strong>Workshop</strong>
                    <small>Compact and cool-toned, for equipment and inventory</small>
                </span>
            </button>
            <button
                class="skin"
                class:on={settings.skin === 'craft'}
                aria-pressed={settings.skin === 'craft'}
                onclick={() => updateSkin('craft')}
            >
                <span class="swatch craft" aria-hidden="true"></span>
                <span class="skin-text">
                    <strong>Boutique</strong>
                    <small>Warm and roomy, for products, packaging and gifts</small>
                </span>
            </button>
        </div>
    </section>

    <section>
        <h3>Animations</h3>
        <div class="options">
            <label class="radio-label">
                <input type="radio" name="animations" value="normal" checked={settings.animations === 'normal'} onchange={() => updateAnimations('normal')} />
                Normal
            </label>
            <label class="radio-label">
                <input type="radio" name="animations" value="fast" checked={settings.animations === 'fast'} onchange={() => updateAnimations('fast')} />
                Fast
            </label>
            <label class="radio-label">
                <input type="radio" name="animations" value="none" checked={settings.animations === 'none'} onchange={() => updateAnimations('none')} />
                None
            </label>
        </div>
    </section>

    <section>
        <h3>Setup</h3>
        <p class="desc">Run the welcome walkthrough again — look, printer and paper, in one pass.</p>
        <button class="replay-btn" onclick={() => settings.replayOnboarding()}>
            <Icon name="printer" size={15} /> Replay setup
        </button>
    </section>

    <section>
        <h3>Default Printer Model</h3>
        <p class="desc">Provides physical dimensions (cutter offset and maximum width) when no printer is connected.</p>
        <!-- The chosen model, drawn. A dropdown can hold text and nothing else,
             so the picture goes above it: choosing "P12" and seeing the P12 is
             a much stronger confirmation than reading the name back. Models
             with no drawing yet fall back to the generic icon rather than
             leaving a hole. -->
        <div class="printer-choice">
            {#if chosenArtwork}
                <PrinterMark artwork={chosenArtwork} size={88} strokePx={0.8} hoverAnimation />
            {:else}
                <span class="choice-icon"><Icon name="printer" size={28} /></span>
            {/if}
            <div class="choice-text">
                <strong>{chosenLabel}</strong>
                <small>{chosenDetail}</small>
            </div>
        </div>
        <select class="settings-select" value={settings.defaultPrinter} onchange={updateDefaultPrinter}>
            <option value="none">None (Raw continuous data)</option>
            {#each PRINTER_PROFILES as profile}
                <option value={profile.id}>{profile.brand} {profile.model}</option>
            {/each}
        </select>
    </section>
</div>

<style>
    .hint { margin: 2px 0 8px; color: var(--muted); font-size: 12px; }
    .replay-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 9px 14px;
        background: var(--panel-2);
        border: 1px solid var(--border);
        border-radius: 10px;
        color: var(--text);
        font-size: 14px;
        cursor: pointer;
    }
    .replay-btn:hover { border-color: var(--accent); color: var(--accent); }
    .skins { display: flex; flex-direction: column; gap: 8px; }
    .skin {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 9px 11px;
        text-align: left;
        background: var(--panel-2);
        border: 1px solid var(--border);
        box-shadow: none;
    }
    .skin:hover { transform: none; border-color: var(--accent); }
    .skin.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--panel-2)); }
    /* The swatches are literal, so the choice is visible before committing. */
    .swatch {
        flex: 0 0 auto;
        width: 34px;
        height: 34px;
        border-radius: 8px;
        border: 1px solid var(--border);
    }
    .swatch.tech { background: linear-gradient(135deg, #6366f1 0 50%, #f3f4f6 50% 100%); }
    .swatch.craft { background: linear-gradient(135deg, #c85a30 0 50%, #faf6f1 50% 100%); border-radius: 12px; }
    .skin-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .skin-text small { color: var(--muted); font-size: 12px; }

    .printer-choice {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        margin-bottom: 8px;
        background: var(--panel-2);
        border: 1px solid var(--border);
        border-radius: 10px;
    }
    .choice-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 56px;
        height: 56px;
        flex: none;
        color: var(--muted);
    }
    .choice-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .choice-text small { color: var(--muted); font-size: 12px; }

    .settings {
        display: flex;
        flex-direction: column;
        gap: 24px;
        padding: 16px;
    }
    section {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
    h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--text);
    }
    .desc {
        margin: -8px 0 0 0;
        font-size: 13px;
        color: var(--muted);
    }
    .options {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }
    .radio-label {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 15px;
        color: var(--text);
        cursor: pointer;
        padding: 8px 12px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: var(--panel);
        transition: border-color 0.15s ease, background 0.15s ease;
    }
    .radio-label:hover {
        background: var(--panel-2);
    }
    .radio-label:has(input:checked) {
        border-color: var(--accent);
        background: color-mix(in srgb, var(--accent) 8%, var(--panel));
    }
    input[type="radio"] {
        accent-color: var(--accent);
        width: 18px;
        height: 18px;
        margin: 0;
    }
    .settings-select {
        margin-top: 4px;
        width: 100%;
        background: var(--panel);
        border: 1px solid var(--border);
        color: var(--text);
        padding: 10px 12px;
        border-radius: 10px;
        font-size: 14px;
    }
    .settings-select:focus {
        border-color: var(--accent);
        outline: none;
    }
</style>
