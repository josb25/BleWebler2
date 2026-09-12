<script lang="ts">
    import { globalSettings as settings, type SkinOption } from '../stores/settings.svelte';
    import PrinterModelPicker from './PrinterModelPicker.svelte';
    import Icon from './Icon.svelte';

    type Category = 'appearance' | 'printer' | 'setup';
    let category = $state<Category>('appearance');

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

    function choosePrinter(id: string) {
        settings.defaultPrinter = id;
        settings.save();
    }
</script>

<div class="settings-layout">
    <nav class="category-nav" aria-label="Settings categories">
        <button
            type="button"
            class="cat-btn"
            class:active={category === 'appearance'}
            aria-current={category === 'appearance' ? 'page' : undefined}
            onclick={() => (category = 'appearance')}
        >
            <Icon name="pencil" size={16} />
            <span>Appearance</span>
        </button>
        <button
            type="button"
            class="cat-btn"
            class:active={category === 'printer'}
            aria-current={category === 'printer' ? 'page' : undefined}
            onclick={() => (category = 'printer')}
        >
            <Icon name="printer" size={16} />
            <span>Printer</span>
        </button>
        <button
            type="button"
            class="cat-btn"
            class:active={category === 'setup'}
            aria-current={category === 'setup' ? 'page' : undefined}
            onclick={() => (category = 'setup')}
        >
            <Icon name="settings" size={16} />
            <span>Setup</span>
        </button>
    </nav>

    <div class="content-pane">
        {#if category === 'appearance'}
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
                        type="button"
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
                        type="button"
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
        {:else if category === 'printer'}
            <section>
                <h3>Default Printer Model</h3>
                <p class="desc">Provides physical dimensions (cutter offset and maximum width) when no printer is connected. Display details reference the pinned OpenTLP catalogue snapshot.</p>
                <PrinterModelPicker selectedId={settings.defaultPrinter} onselect={choosePrinter} />
            </section>
        {:else if category === 'setup'}
            <section>
                <h3>Setup</h3>
                <p class="desc">Run the welcome walkthrough again — look, printer and paper, in one pass.</p>
                <button type="button" class="replay-btn" onclick={() => settings.replayOnboarding()}>
                    <Icon name="printer" size={15} /> Replay setup
                </button>
            </section>
        {/if}
    </div>
</div>

<style>
    .settings-layout {
        display: flex;
        flex-direction: row;
        gap: 20px;
        min-height: 340px;
    }
    .category-nav {
        display: flex;
        flex-direction: column;
        gap: 4px;
        width: 150px;
        flex-shrink: 0;
        border-right: 1px solid var(--border);
        padding-right: 14px;
    }
    .cat-btn {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 9px 12px;
        border: 1px solid transparent;
        border-radius: 10px;
        background: transparent;
        color: var(--muted);
        cursor: pointer;
        text-align: left;
        font-size: 14px;
        font-weight: 500;
        box-shadow: none;
        transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    }
    .cat-btn:hover {
        background: var(--panel-2);
        color: var(--text);
        transform: none;
        box-shadow: none;
    }
    .cat-btn.active {
        background: color-mix(in srgb, var(--accent) 10%, var(--panel-2));
        color: var(--text);
        border-color: var(--accent);
        font-weight: 600;
        transform: none;
        box-shadow: none;
    }
    .content-pane {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 20px;
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
        margin: -4px 0 0 0;
        font-size: 13px;
        color: var(--muted);
        line-height: 1.4;
    }
    .hint {
        margin: 2px 0 8px;
        color: var(--muted);
        font-size: 12px;
    }
    .options {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .radio-label {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 14px;
        color: var(--text);
        cursor: pointer;
        padding: 8px 12px;
        border: 1px solid var(--border);
        border-radius: 10px;
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
    .skins {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .skin {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 9px 11px;
        text-align: left;
        background: var(--panel-2);
        border: 1px solid var(--border);
        border-radius: 12px;
        box-shadow: none;
        cursor: pointer;
        color: inherit;
    }
    .skin:hover {
        transform: none;
        border-color: var(--accent);
    }
    .skin.on {
        border-color: var(--accent);
        background: color-mix(in srgb, var(--accent) 12%, var(--panel-2));
    }
    .swatch {
        flex: 0 0 auto;
        width: 34px;
        height: 34px;
        border-radius: 8px;
        border: 1px solid var(--border);
    }
    .swatch.tech {
        background: linear-gradient(135deg, #6366f1 0 50%, #f3f4f6 50% 100%);
    }
    .swatch.craft {
        background: linear-gradient(135deg, #c85a30 0 50%, #faf6f1 50% 100%);
        border-radius: 12px;
    }
    .skin-text {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
    }
    .skin-text small {
        color: var(--muted);
        font-size: 12px;
    }
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
        width: fit-content;
    }
    .replay-btn:hover {
        border-color: var(--accent);
        color: var(--accent);
        transform: none;
        box-shadow: none;
    }

    @media (max-width: 640px) {
        .settings-layout {
            flex-direction: column;
            gap: 14px;
            min-height: 0;
        }
        .category-nav {
            flex-direction: row;
            width: 100%;
            border-right: none;
            border-bottom: 1px solid var(--border);
            padding-right: 0;
            padding-bottom: 10px;
            gap: 6px;
            overflow-x: auto;
        }
        .cat-btn {
            flex: 1;
            justify-content: center;
            padding: 8px 10px;
            font-size: 13px;
            white-space: nowrap;
        }
    }
    @media (max-width: 420px) {
        .cat-btn {
            gap: 0;
            padding: 8px;
            font-size: 12px;
            white-space: nowrap !important;
        }
        .cat-btn :global(svg) {
            display: none;
        }
    }
</style>
