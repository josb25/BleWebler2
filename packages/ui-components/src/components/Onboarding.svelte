<script lang="ts">
    /**
     * First run: look, printer, paper, done.
     *
     * Every step writes straight to {@link globalSettings} rather than
     * collecting answers and applying them at the end. That means there is no
     * onboarding-only state to keep in step with the real settings, skipping out
     * halfway keeps whatever you already chose, and each choice is visible
     * behind the panel as you make it.
     *
     * Nothing here blocks. Someone who skips every step lands exactly where they
     * would have landed without it — this replaces a blank first screen, it does
     * not gate the app.
     *
     * The printer and paper steps embed {@link ConnectPanel} and
     * {@link PaperPanel} — the same components the main UI uses — rather than
     * restating them. These were duplicated once, and the copies drifted: the
     * onboarding pair silently dropped unavailable transports along with the
     * reason they were unavailable, never surfaced a connection error, and could
     * only pick existing paper, so anyone whose stock was not in the list had to
     * finish setup before they could describe it. Reusing the panels also means
     * custom paper can be defined here, on the step that asks what is loaded.
     */
    import { fromStore } from 'svelte/store';
    import { globalSettings as settings, PRINTER_PROFILES, type SkinOption, type ThemeOption } from '../stores/settings.svelte';
    import type { PrinterSession } from '../printer/session';
    import type { TransportOption } from '../printer/transports';
    import type { EditorStore } from '../stores/editor.svelte';
    import { artworkFor } from '../data/artwork';
    import PrinterMark from './PrinterMark.svelte';
    import ConnectPanel from './ConnectPanel.svelte';
    import PaperPanel from './PaperPanel.svelte';
    import Icon from './Icon.svelte';

    interface Props {
        session: PrinterSession;
        transports: TransportOption[];
        editor: EditorStore;
        onclose: () => void;
    }
    let { session, transports, editor, onclose }: Props = $props();

    // svelte-ignore state_referenced_locally -- session identity is stable.
    const printer = fromStore(session);
    const snap = $derived(printer.current);

    const STEPS = ['look', 'printer', 'paper', 'done'] as const;
    type Step = (typeof STEPS)[number];
    const STEP_LABELS: Record<Step, string> = {
        look: 'Look',
        printer: 'Printer',
        paper: 'Paper',
        done: 'Ready',
    };
    let step = $state<Step>('look');
    const index = $derived(STEPS.indexOf(step));

    function next(): void { if (index < STEPS.length - 1) step = STEPS[index + 1]; }
    function back(): void { if (index > 0) step = STEPS[index - 1]; }

    /** Finish or skip — both mean "don't ask again". */
    function finish(): void {
        settings.onboarded = true;
        settings.save();
        onclose();
    }

    function setSkin(skin: SkinOption): void { settings.skin = skin; settings.save(); }
    function setTheme(theme: ThemeOption): void { settings.theme = theme; settings.save(); }

    function choosePrinter(id: string): void {
        settings.defaultPrinter = id;
        settings.save();
    }


</script>

<div class="scrim" role="dialog" aria-modal="true" aria-label="Welcome to BleWebler2">
    <div class="wizard">
        <header class="wiz-head">
            <div class="progress">
                <div class="progress-line">
                    <span class="step-count">Step {index + 1} of {STEPS.length}</span>
                    <span class="step-name">{STEP_LABELS[step]}</span>
                </div>
                <div
                    class="track"
                    role="progressbar"
                    aria-label="Setup progress"
                    aria-valuenow={index + 1}
                    aria-valuemin={1}
                    aria-valuemax={STEPS.length}
                    aria-valuetext="Step {index + 1} of {STEPS.length}: {STEP_LABELS[step]}"
                >
                    <div class="fill" style="width: {((index + 1) / STEPS.length) * 100}%"></div>
                </div>
            </div>
            <button class="skip" onclick={finish}>Skip setup</button>
        </header>

        <div class="wiz-body">
            {#if step === 'look'}
                <h2>Make it yours</h2>
                <p class="lede">Two looks, both work in light or dark. You can change this any time in Settings.</p>
                <div class="choices">
                    {#each [{ id: 'tech', name: 'Workshop', desc: 'Compact and technical' }, { id: 'craft', name: 'Boutique', desc: 'Warmer and softer' }] as opt (opt.id)}
                        <button class="choice" class:on={settings.skin === opt.id} onclick={() => setSkin(opt.id as SkinOption)}>
                            <span class="swatch skin-{opt.id}"></span>
                            <span class="choice-text">
                                <strong>{opt.name}</strong>
                                <small>{opt.desc}</small>
                            </span>
                        </button>
                    {/each}
                </div>
                <div class="seg">
                    {#each [{ id: 'system', label: 'System' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }] as opt (opt.id)}
                        <button class="seg-btn" class:on={settings.theme === opt.id} onclick={() => setTheme(opt.id as ThemeOption)}>{opt.label}</button>
                    {/each}
                </div>

            {:else if step === 'printer'}
                <h2>Your printer</h2>
                <p class="lede">
                    Two ways to do this: connect the printer in front of you, or pick the model
                    from the list. Connecting reads the machine's real capabilities; picking just
                    tells the app what sizes and limits to design against.
                </p>

                <section class="path">
                    <div class="path-head">
                        <strong>Connect a real printer</strong>
                        <small>Turn it on and put it in range, then choose how to reach it.</small>
                    </div>
                    <ConnectPanel {session} {transports} />
                </section>

                <div class="or"><span>or</span></div>

                <section class="path">
                    <div class="path-head">
                        <strong>Pick the model</strong>
                        <small>Used whenever no printer is connected, so you can design without hardware.</small>
                    </div>
                    <div class="printer-grid">
                        {#each PRINTER_PROFILES as p (p.id)}
                            {@const art = artworkFor(p)}
                            <button class="printer-card" class:on={settings.defaultPrinter === p.id} onclick={() => choosePrinter(p.id)}>
                                {#if art}
                                    <PrinterMark artwork={art} size={72} strokePx={0.8} title={p.model} />
                                {:else}
                                    <span class="card-icon"><Icon name="printer" size={36} /></span>
                                {/if}
                                <span class="card-name">{p.rebadgeOnly ? `${p.brand}-compatible` : p.brand}</span>
                                <strong class="card-model">{p.model}</strong>
                            </button>
                        {/each}
                    </div>
                </section>

            {:else if step === 'paper'}
                <h2>What's loaded?</h2>
                <p class="lede">
                    The tape in the machine right now. Only stock that fits your printer is listed —
                    and if yours isn't here, define it now with <em>New paper</em>.
                </p>
                <PaperPanel {editor} {session} />

            {:else}
                <h2>Ready</h2>
                <p class="lede">That's everything. Here's what you're set up with:</p>
                <ul class="summary">
                    <li><span>Look</span><strong>{settings.skin === 'craft' ? 'Boutique' : 'Workshop'} · {settings.theme}</strong></li>
                    <li>
                        <span>Printer</span>
                        <strong>
                            {snap.state === 'connected'
                                ? (snap.deviceName ?? 'Connected')
                                : (PRINTER_PROFILES.find(p => p.id === settings.defaultPrinter)?.model ?? 'None')}
                        </strong>
                    </li>
                    <li><span>Paper</span><strong>{settings.paper?.name ?? 'Not set'}</strong></li>
                </ul>
                <p class="fine">All of this lives in Settings, and you can replay this walkthrough from there.</p>
            {/if}
        </div>

        <footer class="wiz-foot">
            <button class="btn ghost" onclick={back} disabled={index === 0}>Back</button>
            <span class="spacer"></span>
            {#if step === 'done'}
                <button class="btn primary" onclick={finish}>Start designing</button>
            {:else}
                <button class="btn primary" onclick={next}>Next</button>
            {/if}
        </footer>
    </div>
</div>

<style>
    .scrim {
        position: fixed;
        inset: 0;
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(3px);
        box-sizing: border-box;
    }
    .wizard {
        display: flex;
        flex-direction: column;
        width: min(720px, 100%);
        max-height: min(760px, 100%);
        background: var(--panel);
        color: var(--text);
        border: 1px solid var(--border);
        border-radius: 16px;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
        overflow: hidden;
    }
    .wiz-head {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 18px;
        border-bottom: 1px solid var(--border);
    }
    /* A captioned bar rather than four tappable pills: the pills read as
       controls and invited clicks into steps, when all this has to say is how
       far along you are. Back/Next own the navigation. */
    .progress { flex: 1; display: flex; flex-direction: column; gap: 6px; }
    .progress-line {
        display: flex;
        align-items: baseline;
        gap: 8px;
        font-size: 12px;
    }
    .step-count { color: var(--muted); }
    .step-name { font-weight: 600; }
    .track {
        height: 4px;
        border-radius: 999px;
        background: var(--border);
        overflow: hidden;
    }
    .fill {
        height: 100%;
        border-radius: inherit;
        background: var(--accent);
        transition: width 0.25s ease;
    }
    @media (prefers-reduced-motion: reduce) {
        .fill { transition: none; }
    }
    .skip {
        background: none;
        border: none;
        color: var(--muted);
        font-size: 13px;
        cursor: pointer;
    }
    .skip:hover { color: var(--text); }

    .wiz-body {
        padding: 20px 22px;
        overflow-y: auto;
    }
    h2 { margin: 0 0 6px; font-size: 20px; }
    .lede { margin: 0 0 16px; color: var(--muted); font-size: 14px; line-height: 1.45; }
    .fine { margin: 14px 0 0; color: var(--muted); font-size: 12px; }

    .choices { display: flex; gap: 10px; flex-wrap: wrap; }
    .choice {
        display: flex;
        align-items: center;
        gap: 10px;
        flex: 1 1 200px;
        padding: 10px 12px;
        background: var(--panel-2);
        border: 1px solid var(--border);
        border-radius: 12px;
        cursor: pointer;
        text-align: left;
        color: inherit;
    }
    .choice.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--panel-2)); }
    .choice-text { display: flex; flex-direction: column; }
    .choice-text small { color: var(--muted); font-size: 12px; }
    .swatch {
        width: 30px; height: 30px; border-radius: 8px; flex: none;
        border: 1px solid var(--border);
    }
    .skin-tech { background: linear-gradient(135deg, #4f46e5, #1e293b); }
    .skin-craft { background: linear-gradient(135deg, #e8b98a, #8d5a3b); }

    .seg { display: inline-flex; margin-top: 14px; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
    .seg-btn {
        padding: 7px 14px;
        background: var(--panel-2);
        border: none;
        border-right: 1px solid var(--border);
        color: var(--muted);
        cursor: pointer;
        font-size: 13px;
    }
    .seg-btn:last-child { border-right: none; }
    .seg-btn.on { background: var(--accent); color: #fff; }

    /* The two setup paths receive equal, labelled emphasis. */
    .path { display: flex; flex-direction: column; gap: 10px; }
    .path-head { display: flex; flex-direction: column; gap: 2px; }
    .path-head strong { font-size: 14px; }
    .path-head small { color: var(--muted); font-size: 12px; }

    .or {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 16px 0;
        color: var(--muted);
        font-size: 12px;
    }
    .or::before, .or::after {
        content: '';
        flex: 1;
        height: 1px;
        background: var(--border);
    }

    .printer-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 10px;
    }
    .printer-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 12px 8px;
        background: var(--panel-2);
        border: 1px solid var(--border);
        border-radius: 12px;
        cursor: pointer;
        color: inherit;
    }
    .printer-card.on {
        border-color: var(--accent);
        background: color-mix(in srgb, var(--accent) 8%, var(--panel-2));
    }
    .card-icon { color: var(--muted); }
    .card-name { font-size: 11px; color: var(--muted); }
    .card-model { font-size: 13px; }

    .summary { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .summary li {
        display: flex; justify-content: space-between; gap: 12px;
        padding: 10px 12px; background: var(--panel-2);
        border: 1px solid var(--border); border-radius: 10px;
    }
    .summary span { color: var(--muted); font-size: 13px; }

    .wiz-foot {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 14px 18px;
        border-top: 1px solid var(--border);
    }
    .spacer { flex: 1; }
    .btn {
        display: inline-flex; align-items: center; gap: 7px;
        padding: 9px 16px; border-radius: 10px;
        border: 1px solid var(--border); background: var(--panel-2);
        color: var(--text); font-size: 14px; cursor: pointer;
    }
    .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
    .btn.ghost { background: none; }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }

    @media (max-width: 420px) {
        .scrim { padding: 0; }
        .wizard {
            width: 100%;
            max-height: 100dvh;
            height: 100dvh;
            border: none;
            border-radius: 0;
        }
        .wiz-head { padding: 12px; }
        .wiz-body { padding: 16px 14px; }
        .wiz-foot {
            padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
        }
        .skip,
        .btn { min-height: 40px; }
        .printer-grid { grid-template-columns: 1fr 1fr; }
        .summary li { flex-wrap: wrap; }
    }
</style>
