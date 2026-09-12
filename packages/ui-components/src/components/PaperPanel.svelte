<script lang="ts">
    import { fromStore } from 'svelte/store';
    import { DEFAULT_PAPER_PROFILES, type PaperProfile } from 'universal-label-core';
    import { globalSettings as settings, DEFAULT_PRINTER_CAPS } from '../stores/settings.svelte';
    import type { EditorStore } from '../stores/editor.svelte';
    import type { PrinterSession } from '../printer/session';
    import Icon from './Icon.svelte';
    import PaperPreview from './PaperPreview.svelte';
    import { resolveLoadedPaper } from '../printer/media-paper';
    import {
        buildPaperFile, serializePaperFile, parsePaperFileJSON, isValidPath
    } from 'universal-label-renderer';

    interface Props {
        editor: EditorStore;
        session: PrinterSession;
    }
    let { editor, session }: Props = $props();

    // svelte-ignore state_referenced_locally -- session identity is stable.
    const printer = fromStore(session);
    const snap = $derived(printer.current);
    let activeCapabilities = $derived(
        snap.capabilities ?? DEFAULT_PRINTER_CAPS[settings.defaultPrinter] ?? DEFAULT_PRINTER_CAPS['none']
    );
    const basePapers = $derived([...DEFAULT_PAPER_PROFILES, ...settings.customPapers]);
    const detectedMedia = $derived(
        snap.status?.media?.identification
        && snap.status.media.widthMm !== undefined
        && (snap.status.media.kind === 'continuous' || snap.status.media.lengthMm !== undefined)
            ? snap.status.media
            : undefined
    );
    const detectedResolution = $derived(detectedMedia
        ? resolveLoadedPaper(
            detectedMedia,
            basePapers,
            settings.paper,
            activeCapabilities.canvasHeightPx / (activeCapabilities.dpmm || 8)
        )
        : undefined
    );
    const detectedPaper = $derived(detectedResolution?.paper);
    let allPapers = $derived([
        ...(detectedPaper ? [detectedPaper] : []),
        ...DEFAULT_PAPER_PROFILES.filter(p => p.id !== detectedPaper?.id),
        ...settings.customPapers.filter(p => p.id !== detectedPaper?.id)
    ]);
    let availablePapers = $derived(allPapers.filter(p => {
        const maxMm = (activeCapabilities.canvasHeightPx / (activeCapabilities.dpmm || 8)) + 10;
        return p.tapeWidthMm <= maxMm;
    }));

    function selectPaper(p: PaperProfile): void {
        editor.setPaper(p);
    }

    // Form state
    let isCreating = $state(false);
    let newName = $state('');
    let newType = $state<'continuous' | 'gap'>('continuous');
    let newWidthMm = $state(15);
    let newLabelWidthMm = $state<number | undefined>(undefined);
    let newLengthMm = $state(40);
    let newGapMm = $state(2);
    let newRadiusMm = $state(1.5);

    /** The shape of the label itself, independent of the roll it sits on. */
    let newShape = $state<'rect' | 'ellipse' | 'path'>('rect');
    /** SVG path data in millimetres, label space — pasted or imported. */
    let newPathMm = $state('');
    let newMountDeg = $state<0 | 90 | 180 | 270>(0);
    let newBaseColor = $state('#ffffff');
    /** Blank means "plain black", which is what almost all stock does. */
    let newInkColor = $state('');
    let pathError = $state('');

    const pathOk = $derived(newShape !== 'path' || (newPathMm.trim() !== '' && isValidPath(newPathMm.trim())));

    $effect(() => {
        pathError = newShape === 'path' && newPathMm.trim() !== '' && !isValidPath(newPathMm.trim())
            ? 'That is not usable path geometry.'
            : '';
    });

    /** The die the form describes, or nothing while a path is still invalid. */
    const draftDie = $derived.by(() => {
        if (newShape === 'ellipse') return { kind: 'ellipse' as const };
        if (newShape === 'path' && pathOk && newPathMm.trim()) {
            return { kind: 'path' as const, dMm: newPathMm.trim() };
        }
        return { kind: 'rect' as const, radiiMm: Math.max(0, newRadiusMm) };
    });

    /**
     * The paper the form currently describes.
     *
     * Built from the same fields `savePaper` will store, so the preview cannot
     * drift from what actually gets stored.
     */
    const draftPaper = $derived<PaperProfile>({
        id: 'draft',
        name: newName.trim() || 'New paper',
        type: newType,
        tapeWidthMm: Math.max(1, newWidthMm),
        mountRotationDeg: newMountDeg,
        appearance: { baseColor: newBaseColor },
        ...(newInkColor
            ? { inks: [{ id: 'ink', color: newInkColor, primary: true, produced: { via: 'thermal' as const } }] }
            : {}),
        ...(newType === 'gap'
            ? {
                labelLengthMm: Math.max(1, newLengthMm),
                gapMm: Math.max(0, newGapMm),
                borderRadiusMm: Math.max(0, newRadiusMm),
                die: draftDie,
                ...(newLabelWidthMm ? { labelWidthMm: newLabelWidthMm } : {})
            }
            : {})
    });

    /**
     * The profile being edited, if any.
     *
     * A built-in can be opened here too — editing one saves a custom copy
     * rather than changing it, because the bundled profiles are what everything
     * else measures against and a user should be able to get back to them.
     */
    let editingId = $state<string | null>(null);
    const editingBuiltIn = $derived(
        editingId !== null && !settings.customPapers.some(p => p.id === editingId)
    );

    /** Load a profile into the form. */
    function startEdit(p: PaperProfile): void {
        editingId = p.id;
        newName = p.name.replace(/\s*\(Custom\)$/, '');
        newType = p.labelLengthMm ? 'gap' : 'continuous';
        newWidthMm = p.tapeWidthMm;
        newLabelWidthMm = p.labelWidthMm;
        newLengthMm = p.labelLengthMm ?? 40;
        newGapMm = p.gapMm ?? 2;
        newRadiusMm = p.borderRadiusMm ?? 0;
        newShape = p.die?.kind === 'ellipse' ? 'ellipse' : p.die?.kind === 'path' ? 'path' : 'rect';
        newPathMm = p.die?.kind === 'path' ? p.die.dMm : '';
        newMountDeg = p.mountRotationDeg ?? 0;
        newBaseColor = p.appearance?.baseColor ?? p.appearance?.colorways?.[0]?.color ?? '#ffffff';
        newInkColor = p.inks?.[0]?.color ?? '';
        isCreating = true;
    }

    function startCreate(): void {
        editingId = null;
        newName = '';
        newType = 'continuous';
        newWidthMm = 15;
        newLabelWidthMm = undefined;
        newLengthMm = 40;
        newGapMm = 2;
        newRadiusMm = 1.5;
        newShape = 'rect';
        newPathMm = '';
        newMountDeg = 0;
        newBaseColor = '#ffffff';
        newInkColor = '';
        isCreating = true;
    }

    function savePaper() {
        if (!newName.trim() || !pathOk) return;

        // Built from the draft so what was previewed is exactly what is stored;
        // rebuilding the object by hand is how the two drift apart.
        const editingCustom = editingId !== null && !editingBuiltIn;
        const p: PaperProfile = {
            ...draftPaper,
            id: editingCustom ? editingId! : 'custom_' + Date.now(),
            name: newName.trim() + (editingCustom ? '' : ' (Custom)')
        };

        settings.customPapers = editingCustom
            ? settings.customPapers.map(x => (x.id === p.id ? p : x))
            : [...settings.customPapers, p];
        settings.save();

        editor.setPaper(p);
        isCreating = false;
        editingId = null;
        newName = '';
    }
    
    let importInput = $state<HTMLInputElement | null>(null);
    let importNote = $state('');

    /**
     * Save one paper format as a file.
     *
     * Working out the exact die line, pitch and colourway of an obscure roll is
     * real work, and until now it was trapped in one person's settings.
     */
    function exportPaper(p: PaperProfile): void {
        const blob = new Blob([serializePaperFile(buildPaperFile(p))], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${p.name.replace(/[^\w\- ]+/g, '').trim() || 'paper'}.ult-paper.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async function importPaper(files: FileList | null): Promise<void> {
        const file = files?.[0];
        if (!file) return;
        importNote = '';
        const res = parsePaperFileJSON(await file.text());
        if (!res.ok) {
            importNote = res.errors.join('; ');
        } else {
            settings.customPapers = [...settings.customPapers, res.paper];
            settings.save();
            editor.setPaper(res.paper);
            // Warnings are shown rather than swallowed: a die line that failed
            // to load leaves a rectangle, and silently is the worst way to
            // find that out.
            importNote = res.warnings.length
                ? `Imported “${res.paper.name}” — ${res.warnings.join('; ')}`
                : `Imported “${res.paper.name}”.`;
        }
        if (importInput) importInput.value = '';
    }

    function deleteCustomPaper(id: string) {
        settings.customPapers = settings.customPapers.filter(p => p.id !== id);
        settings.save();
        if (editor.design.paper?.id === id) {
            editor.setPaper(availablePapers[0]);
        }
    }
</script>

<div class="paper-panel">
    {#if isCreating}
        <div class="create-form">
            <button class="icon-btn back-btn" onclick={() => (isCreating = false)}>
                <Icon name="arrow-left" size={16} /> Back
            </button>
            <h3>{editingId ? (editingBuiltIn ? 'Copy & Edit Paper' : 'Edit Paper') : 'Define Custom Paper'}</h3>
            {#if editingBuiltIn}
                <p class="hint">Built-in formats stay as they are — saving keeps your changes as a new custom paper.</p>
            {/if}

            <div class="form-group">
                <label for="p-name">Paper Name</label>
                <input id="p-name" class="input-field" type="text" bind:value={newName} placeholder="e.g. My 20mm Round Labels" />
            </div>

            <div class="form-group">
                <label for="p-type">Media Type</label>
                <select id="p-type" class="input-field" bind:value={newType}>
                    <option value="continuous">Continuous Tape</option>
                    <option value="gap">Gap / Die-cut Labels</option>
                </select>
            </div>

            <div class="form-group">
                <label for="p-width">Tape Width (mm)</label>
                <input id="p-width" class="input-field" type="number" min="1" max="120" bind:value={newWidthMm} />
                <span class="hint">Physical width of the media roll.</span>
            </div>

            {#if newType === 'gap'}
                <div class="form-row">
                    <div class="form-group">
                        <label for="p-len">Label Length (mm)</label>
                        <input id="p-len" class="input-field" type="number" min="1" max="500" bind:value={newLengthMm} />
                    </div>
                    <div class="form-group">
                        <label for="p-lwidth">Label Width (mm)</label>
                        <input id="p-lwidth" class="input-field" type="number" min="1" max="120" bind:value={newLabelWidthMm} placeholder={newWidthMm.toString()} />
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="p-gap">Gap Size (mm)</label>
                        <input id="p-gap" class="input-field" type="number" min="0" max="20" step="0.5" bind:value={newGapMm} />
                    </div>
                    <div class="form-group">
                        <label for="p-rad">Corner Radius (mm)</label>
                        <input id="p-rad" class="input-field" type="number" min="0" max="10" step="0.5" bind:value={newRadiusMm} disabled={newShape !== 'rect'} />
                    </div>
                </div>

                <!-- The die: what the sticker *is*, as distinct from the roll it
                     rides on. Only layout and preview care; the print head marks
                     a rectangle whatever shape you choose. -->
                <div class="form-group">
                    <label for="p-shape">Label Shape</label>
                    <select id="p-shape" class="input-field" bind:value={newShape}>
                        <option value="rect">Rectangle</option>
                        <option value="ellipse">Ellipse / circle</option>
                        <option value="path">Custom outline</option>
                    </select>
                </div>

                {#if newShape === 'path'}
                    <div class="form-group">
                        <label for="p-path">Outline (SVG path, in mm)</label>
                        <textarea
                            id="p-path"
                            class="input-field mono"
                            rows="3"
                            bind:value={newPathMm}
                            placeholder="M0 0 H25 V38 H16 V78 H9 V38 H0 Z"
                        ></textarea>
                        <span class="hint">
                            Geometry only, drawn with the label upright and the origin top-left.
                            The T-shape above is a 25 × 38 mm head with a 7 × 40 mm tail.
                        </span>
                        {#if pathError}<span class="err">{pathError}</span>{/if}
                    </div>

                    <div class="form-group">
                        <label for="p-mount">Sits on the roll</label>
                        <select id="p-mount" class="input-field" bind:value={newMountDeg}>
                            <option value={0}>Upright</option>
                            <option value={90}>Rotated 90°</option>
                            <option value={180}>Upside down</option>
                            <option value={270}>Rotated 270°</option>
                        </select>
                        <span class="hint">
                            A 40 × 60 mm shape on 40 mm tape is mounted at 90°.
                        </span>
                    </div>
                {/if}
            {/if}

            <div class="form-row">
                <div class="form-group">
                    <label for="p-base">Paper colour</label>
                    <input id="p-base" class="input-field color" type="color" bind:value={newBaseColor} />
                </div>
                <div class="form-group">
                    <label for="p-ink">Prints as</label>
                    <!-- Most stock develops black. Stock that develops blue or red
                         is a property of the paper, not the printer, which is why
                         it is set here. -->
                    <div class="ink-row">
                        <input
                            id="p-ink"
                            class="input-field color"
                            type="color"
                            value={newInkColor || '#111111'}
                            oninput={e => (newInkColor = e.currentTarget.value)}
                        />
                        {#if newInkColor}
                            <button class="icon-btn" title="Back to plain black" onclick={() => (newInkColor = '')}>
                                <Icon name="x" size={14} />
                            </button>
                        {/if}
                    </div>
                    <span class="hint">{newInkColor ? 'Develops this colour' : 'Plain black'}</span>
                </div>
            </div>

            <!-- Live, so the numbers being typed are checkable against something
                 other than imagination. A 40 mm gap on a 12 mm label is obvious
                 here and invisible in a form. -->
            <div class="form-group">
                <span class="lbl">Preview</span>
                <div class="preview-frame">
                    <PaperPreview paper={draftPaper} />
                </div>
            </div>

            <button class="btn-primary" onclick={savePaper} disabled={!newName.trim() || !pathOk}>
                {editingId && !editingBuiltIn ? 'Save Changes' : 'Save Paper'}
            </button>
        </div>
    {:else}
        <div class="list-section">
            <p class="desc">Select the paper loaded in your printer. Options are constrained by the maximum width of your currently selected printer model.</p>
            
            <div class="paper-list">
                {#each availablePapers as p (p.id)}
                    {@const isCustom = p.id.startsWith('custom_')}
                    {@const isDetected = p.id === detectedPaper?.id}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div class="paper-item" class:active={editor.design.paper?.id === p.id} onclick={() => selectPaper(p)}>
                        <!-- The roll itself, drawn from the profile: quicker to
                             recognise than the numbers, and it makes a mistyped
                             gap or radius visible before it reaches a print. -->
                        <div class="p-thumb">
                            <PaperPreview paper={p} scale={1.6} length={46} annotate={false} />
                        </div>
                        <div class="p-info">
                            <span class="p-name">
                                {p.name}
                                {#if isDetected}<span class="media-badge">{detectedMedia?.identification?.technology ?? 'media'} detected</span>{/if}
                            </span>
                            <span class="p-desc">
                                Tape: {p.tapeWidthMm}mm 
                                {#if p.labelLengthMm}
                                    | Label: {p.labelWidthMm || p.tapeWidthMm} × {p.labelLengthMm}mm
                                {/if}
                                • {p.type}
                            </span>
                            {#if isDetected && detectedMedia}
                                <span class="media-info">
                                    {#if detectedMedia.identification?.uid}<span>UID {detectedMedia.identification.uid}</span>{/if}
                                    {#if detectedMedia.identification?.barcode}<span>Barcode {detectedMedia.identification.barcode}</span>{/if}
                                    {#if detectedMedia.identification?.serialNumber}<span>Serial {detectedMedia.identification.serialNumber}</span>{/if}
                                    {#if detectedMedia.total !== undefined}<span>Used {detectedMedia.used ?? '—'} / {detectedMedia.total}</span>{/if}
                                    {#if detectedMedia.capacity !== undefined}<span>Capacity {detectedMedia.capacity}</span>{/if}
                                </span>
                                <span class="dimension-note">
                                    Dimensions read locally from the printer or its roll identifier. Exact die and corner geometry are not reported.
                                </span>
                            {/if}
                        </div>
                        <div class="paper-actions">
                            {#if editor.design.paper?.id === p.id}
                                <div class="p-check" title="Selected"><Icon name="check" size={16} /></div>
                            {/if}
                            {#if !isDetected}
                                <button
                                    class="icon-btn"
                                    onclick={(e) => { e.stopPropagation(); startEdit(p); }}
                                    title={isCustom ? `Edit “${p.name}”` : `Copy “${p.name}” and edit it`}
                                >
                                    <Icon name="pencil" size={15} />
                                </button>
                                <button class="icon-btn" onclick={(e) => { e.stopPropagation(); exportPaper(p); }} title="Save “{p.name}” as a file you can share">
                                    <Icon name="download" size={15} />
                                </button>
                            {/if}
                            {#if isCustom}
                                <button class="icon-btn del-btn" onclick={(e) => { e.stopPropagation(); deleteCustomPaper(p.id); }} title="Delete Custom Paper">
                                    <Icon name="trash" size={16} />
                                </button>
                            {/if}
                        </div>
                    </div>
                {/each}
                {#if availablePapers.length === 0}
                    <div class="empty-state">No papers fit the current printer capabilities.</div>
                {/if}
            </div>

            {#if importNote}
                <div class="import-note">{importNote}</div>
            {/if}

            <button class="btn-secondary" onclick={startCreate}>
                <Icon name="plus" size={16} /> Define Custom Paper
            </button>
            <button class="btn-secondary" onclick={() => importInput?.click()} title="Open a paper format someone shared">
                <Icon name="upload" size={16} /> Import Paper Format
            </button>
            <input
                bind:this={importInput}
                type="file"
                accept=".json,application/json"
                hidden
                onchange={e => importPaper(e.currentTarget.files)}
            />
        </div>
    {/if}
</div>

<style>
    .paper-panel {
        padding: 0 4px;
        color: var(--text);
    }
    .desc {
        font-size: 13px;
        color: var(--muted);
        margin-bottom: 16px;
        line-height: 1.4;
    }
    .paper-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 20px;
        max-height: 400px;
        overflow-y: auto;
    }
    .paper-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 3px;
        cursor: pointer;
        transition: all 0.2s ease;
    }
    .paper-item:hover {
        background: var(--panel-2);
    }
    .paper-item.active {
        border-color: var(--accent);
        background: color-mix(in srgb, var(--accent) 8%, var(--panel));
    }
    .p-thumb {
        display: flex;
        align-items: center;
        flex: none;
        /* The roll drawing is the item's anchor; keep it a fixed column so the
           names below it still line up across rolls of different widths. */
        width: 88px;
        justify-content: center;
        opacity: 0.9;
    }
    .paper-item.active .p-thumb {
        opacity: 1;
    }
    .p-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    .p-name {
        font-weight: 500;
        font-size: 14px;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
    }
    .p-desc {
        font-size: 12px;
        color: var(--muted);
        text-transform: capitalize;
        overflow-wrap: anywhere;
    }
    .media-badge {
        padding: 2px 6px;
        border-radius: 999px;
        color: var(--ok);
        background: color-mix(in srgb, var(--ok) 12%, var(--panel));
        border: 1px solid color-mix(in srgb, var(--ok) 35%, var(--border));
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
    }
    .media-info {
        display: flex;
        flex-wrap: wrap;
        gap: 2px 10px;
        color: var(--muted);
        font-family: var(--mono);
        font-size: 10px;
        overflow-wrap: anywhere;
    }
    .dimension-note {
        color: var(--warn);
        font-size: 10px;
        line-height: 1.3;
    }
    .p-check {
        color: var(--accent);
        display: flex;
    }
    .paper-actions {
        display: flex;
        align-items: center;
        gap: 4px;
        flex: none;
    }
    .del-btn {
        opacity: 0.5;
        padding: 4px;
    }
    .del-btn:hover {
        opacity: 1;
        color: var(--error, #ef4444);
    }
    
    .btn-secondary, .btn-primary {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 12px;
        border-radius: 2px;
        font-weight: 500;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s ease;
        border: none;
    }
    .btn-secondary {
        background: var(--panel-2);
        color: var(--text);
    }
    .btn-secondary:hover {
        background: var(--border);
    }
    .btn-primary {
        background: var(--accent);
        color: var(--accent-fg, #fff);
        margin-top: 16px;
    }
    .btn-primary:hover:not(:disabled) {
        opacity: 0.9;
    }
    .btn-primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .create-form {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }
    .back-btn {
        align-self: flex-start;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 8px;
        margin-left: -8px;
        color: var(--muted);
        font-size: 13px;
        background: none;
        border: none;
        cursor: pointer;
    }
    .back-btn:hover {
        color: var(--text);
    }
    h3 {
        margin: 0 0 8px 0;
        font-size: 16px;
        font-weight: 600;
    }
    .form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .form-row {
        display: flex;
        gap: 12px;
    }
    .form-row > * {
        flex: 1;
    }
    label {
        font-size: 13px;
        font-weight: 500;
        color: var(--muted);
    }
    .hint {
        font-size: 11px;
        color: var(--muted);
    }
    .lbl {
        font-size: 13px;
        font-weight: 500;
        color: var(--muted);
    }
    .input-field.mono {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        resize: vertical;
    }
    .input-field.color {
        padding: 4px;
        height: 38px;
        cursor: pointer;
    }
    .ink-row { display: flex; align-items: center; gap: 6px; }
    .err { font-size: 11px; color: var(--danger, #ef4444); }
    .import-note {
        font-size: 12px;
        color: var(--muted);
        padding: 8px 10px;
        background: var(--panel-2);
        border: 1px solid var(--border);
        border-radius: 2px;
        margin-bottom: 10px;
    }
    .btn-secondary + .btn-secondary { margin-top: 8px; }
    .preview-frame {
        display: flex;
        justify-content: center;
        padding: 12px 8px;
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 2px;
        overflow-x: auto;
    }
    .input-field {
        background: var(--panel);
        border: 1px solid var(--border);
        color: var(--text);
        padding: 10px 12px;
        border-radius: 2px;
        font-size: 14px;
        width: 100%;
        box-sizing: border-box;
    }
    .input-field:focus {
        border-color: var(--accent);
        outline: none;
    }

    @media (max-width: 420px) {
        .paper-panel { padding: 0; }
        .paper-list { max-height: 52dvh; }
        .paper-item {
            display: grid;
            grid-template-columns: 64px minmax(0, 1fr);
            gap: 6px 10px;
            padding: 10px;
        }
        .p-thumb {
            grid-row: 1 / span 2;
            width: 64px;
        }
        .paper-actions {
            justify-content: flex-end;
            min-width: 0;
        }
        .paper-actions .icon-btn {
            min-width: 40px;
            min-height: 40px;
            padding: 7px;
        }
        .form-row { flex-direction: column; }
    }
</style>
