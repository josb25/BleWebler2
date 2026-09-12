<script lang="ts">
    /**
     * The "Adapt" sheet in the template workbench: the author-facing adaptivity
     * material — template name/description, optional supported size range, and
     * the multi-size preview gallery + lint status. This is where "does it hold
     * up at other sizes?" is answered; the template's user never sees it.
     */
    import type { EditorStore } from '../stores/editor.svelte';
    import { TemplateSession } from '../stores/templates.svelte';
    import SizePreviewGallery from './SizePreviewGallery.svelte';
    import Icon from './Icon.svelte';

    interface Props {
        editor: EditorStore;
        saved?: boolean;
        onsave: () => void;
        onclose: () => void;
    }
    let { editor, saved = false, onsave, onclose }: Props = $props();

    const meta = $derived(editor.templateMeta);

    const preview = new TemplateSession();
    const built = $derived(editor.buildCurrentTemplate());
    const builtKey = $derived(built ? JSON.stringify(built) : '');
    $effect(() => { void builtKey; if (built) preview.open(built); });

    const lint = $derived(preview.lint);

    const range = $derived(meta?.adaptivity ?? { designedFor: { tapeWidthMm: 0 } });

    function setRange(key: 'minTapeWidthMm' | 'maxTapeWidthMm' | 'minLabelLengthMm' | 'maxLabelLengthMm', v: string): void {
        editor.setSupportedRange({ [key]: v === '' ? undefined : Number(v) });
    }
</script>

{#if meta}
    <div class="adapt">
        <div class="form">
            <label class="field">
                <span class="lbl">Design name</span>
                <input type="text" value={meta.name} oninput={e => editor.setTemplateName(e.currentTarget.value)} />
            </label>
            <label class="field">
                <span class="lbl">Description</span>
                <textarea rows="2" value={meta.description ?? ''} oninput={e => editor.setTemplateDescription(e.currentTarget.value)}></textarea>
            </label>
            <div class="field">
                <span class="lbl">Designed for</span>
                <span class="designed">{range.designedFor.tapeWidthMm} × {range.designedFor.labelLengthMm ?? '—'} mm</span>
            </div>
            <div class="field">
                <span class="lbl">Position relative to</span>
                <select value={editor.relativeTo} onchange={e => editor.setRelativeTo(e.currentTarget.value as 'printable' | 'media')}>
                    <option value="printable">Printable area</option>
                    <option value="media">Whole label (incl. margins)</option>
                </select>
                <span class="hint">
                    {editor.relativeTo === 'media'
                        ? 'Centred content sits centred on the physical label; parts in the unprintable margin will not print.'
                        : 'Centred content sits centred in what the printer can actually mark.'}
                </span>
            </div>

            <div class="field">
                <span class="lbl">Supported range (optional)</span>
                <div class="range">
                    <label>tape min <input type="number" value={range.minTapeWidthMm ?? ''} placeholder="—" onchange={e => setRange('minTapeWidthMm', e.currentTarget.value)} /></label>
                    <label>tape max <input type="number" value={range.maxTapeWidthMm ?? ''} placeholder="—" onchange={e => setRange('maxTapeWidthMm', e.currentTarget.value)} /></label>
                    <label>len min <input type="number" value={range.minLabelLengthMm ?? ''} placeholder="—" onchange={e => setRange('minLabelLengthMm', e.currentTarget.value)} /></label>
                    <label>len max <input type="number" value={range.maxLabelLengthMm ?? ''} placeholder="—" onchange={e => setRange('maxLabelLengthMm', e.currentTarget.value)} /></label>
                </div>
            </div>
        </div>

        <div class="review">
            {#if lint}
                <div class="status" class:ok={lint.ok} class:bad={!lint.ok}>
                    {#if lint.ok}
                        <Icon name="check" size={16} /> Adapts cleanly across {lint.sizesTested.length} label sizes
                    {:else}
                        <Icon name="info" size={16} /> {lint.findings.filter(f => f.severity === 'error').length} issue(s) at some sizes — see highlighted previews
                    {/if}
                </div>
            {/if}
            <SizePreviewGallery session={preview} />

            <div class="save-actions">
                <button class="primary" onclick={onsave}><Icon name="save" size={15} /> Save design</button>
                <button onclick={onclose}><Icon name="check" size={15} /> Save &amp; close</button>
                {#if saved}<span class="saved-tag"><Icon name="check" size={14} /> Saved</span>{/if}
            </div>
        </div>
    </div>
{/if}

<style>
    .adapt { max-width: 940px; margin: 0 auto; padding: 16px; display: grid; grid-template-columns: 1fr; gap: 20px; }
    @media (min-width: 780px) { .adapt { grid-template-columns: 320px 1fr; align-items: start; } }
    .form { display: flex; flex-direction: column; gap: 14px; }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .lbl { font-size: 12px; font-weight: 600; color: var(--muted); }
    .designed { font-weight: 600; }
    .hint { font-size: 11px; color: var(--muted); }
    .range { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .range label { display: flex; flex-direction: column; gap: 2px; font-size: 11px; color: var(--muted); }
    .review { display: flex; flex-direction: column; gap: 10px; }
    .save-actions { display: flex; align-items: center; gap: 10px; margin-top: 6px; flex-wrap: wrap; }
    .saved-tag { display: inline-flex; align-items: center; gap: 4px; color: var(--ok); font-size: 13px; font-weight: 600; }
    .status { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; padding: 8px 12px; border-left: 3px solid currentColor; border-radius: 2px; border-top: 1px solid var(--border); border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); }
    .status.ok { color: var(--ok); border-color: var(--ok); }
    .status.bad { color: var(--danger); border-color: var(--danger); }
</style>
