<script lang="ts">
    /**
     * The "Preview" sheet in the template workbench: exactly what the template's
     * user will see — the parameter inputs and the live label — so the author can
     * test-fill without leaving the editor. Driven by a throwaway TemplateSession
     * fed from the in-progress template.
     */
    import type { EditorStore } from '../stores/editor.svelte';
    import { TemplateSession } from '../stores/templates.svelte';
    import { rasterizeDesign, compositePage } from 'universal-label-renderer';
    import type { LabelDesign } from 'universal-label-renderer';
    import { applyDieMask } from '../lib/paper-thumb';

    interface Props { editor: EditorStore; }
    let { editor }: Props = $props();

    const preview = new TemplateSession();
    const built = $derived(editor.buildCurrentTemplate());
    const builtKey = $derived(built ? JSON.stringify(built) : '');
    $effect(() => { void builtKey; if (built) preview.open(built); });

    const tpl = $derived(preview.active);
    const resolved = $derived(preview.resolved);
    /** The paper the user actually has loaded: stamped onto the resolved
     * preview so the template's fill-in preview reads on the real die, the
     * same way the editor and print preview do. */
    const paper = $derived(editor.paper);

    let img = $state('');
    const key = $derived(resolved ? JSON.stringify({ p: preview.params, w: preview.targetWidthPx, h: preview.targetHeightPx, pp: paper?.id }) : '');
    $effect(() => {
        void key;
        const design = resolved?.design;
        if (!design) { img = ''; return; }
        let cancelled = false;
        void render(design).then(u => { if (!cancelled) img = u; });
        return () => { cancelled = true; };
    });
    async function render(design: LabelDesign): Promise<string> {
        try {
            const onPaper = paper ? { ...design, paper } : design;
            const image = compositePage(await rasterizeDesign(onPaper), { inks: onPaper.paper?.inks });
            const c = document.createElement('canvas');
            c.width = image.width; c.height = image.height;
            c.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
            applyDieMask(c, onPaper, paper);
            return c.toDataURL();
        } catch { return ''; }
    }
</script>

<div class="inputs">
    {#if tpl}
        <div class="preview-frame">
            {#if img}<img class="preview" src={img} alt="Label preview" />{:else}<span class="ph"></span>{/if}
        </div>

        {#if tpl.params.length === 0}
            <p class="muted">No editable fields yet. Select an element and tick <strong>Editable field</strong> to add one.</p>
        {:else}
            <div class="params">
                {#each tpl.params as param (param.name)}
                    <label class="field">
                        <span class="fld-label">{param.label}</span>
                        {#if param.type === 'boolean'}
                            <input type="checkbox" checked={Boolean(preview.params[param.name])} onchange={e => preview.setParam(param.name, e.currentTarget.checked)} />
                        {:else if param.type === 'number'}
                            <input type="number" value={Number(preview.params[param.name] ?? 0)} oninput={e => preview.setParam(param.name, Number(e.currentTarget.value))} />
                        {:else if param.type === 'select'}
                            <select value={String(preview.params[param.name] ?? '')} onchange={e => preview.setParam(param.name, e.currentTarget.value)}>
                                {#each param.options ?? [] as o (o)}<option value={o}>{o}</option>{/each}
                            </select>
                        {:else if param.multiline}
                            <textarea rows="2" value={String(preview.params[param.name] ?? '')} oninput={e => preview.setParam(param.name, e.currentTarget.value)}></textarea>
                        {:else}
                            <input type="text" value={String(preview.params[param.name] ?? '')} oninput={e => preview.setParam(param.name, e.currentTarget.value)} />
                        {/if}
                    </label>
                {/each}
            </div>
        {/if}
    {/if}
</div>

<style>
    .inputs { max-width: 560px; margin: 0 auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; }
    .preview-frame {
        background: repeating-conic-gradient(var(--checker) 0% 25%, transparent 0% 50%) 50% / 14px 14px, #fff;
        border: 1px solid var(--border); border-radius: 3px; padding: 20px;
        display: flex; align-items: center; justify-content: center; min-height: 150px; box-shadow: var(--shadow);
    }
    .preview { max-width: 100%; image-rendering: pixelated; filter: drop-shadow(0 1px 2px rgb(0 0 0 / 20%)); }
    .ph { width: 60%; height: 60px; background: var(--panel-2); border-radius: 2px; }
    .params { display: flex; flex-direction: column; gap: 12px; }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .fld-label { font-size: 13px; font-weight: 600; color: var(--muted); }
    .muted { color: var(--muted); font-size: 13px; }
</style>
