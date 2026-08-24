<script lang="ts">
    /** Consumer-facing design page: catalogue context, live preview, fields and print CTA. */
    import {
        compositePage, mediaFit, rasterizeDesign,
        type LabelDesign, type SavedLabel, type TemplateImage
    } from 'universal-label-renderer';
    import type { EditorStore } from '../stores/editor.svelte';
    import Icon from './Icon.svelte';

    interface Props {
        editor: EditorStore;
        entry?: SavedLabel;
        onfavorite: () => void;
        onedit: () => void;
        onprint: () => void;
        onpaper: () => void;
    }
    let { editor, entry, onfavorite, onedit, onprint, onpaper }: Props = $props();

    const tpl = $derived(editor.template);
    const params = $derived(tpl.params);
    const paper = $derived(editor.paper);
    const fit = $derived(paper ? mediaFit(tpl, paper.tapeWidthMm, paper.labelLengthMm) : undefined);
    const photos = $derived([
        ...(tpl.gallery?.cover ? [tpl.gallery.cover] : []),
        ...(tpl.gallery?.shots ?? [])
    ]);
    let selectedPhoto = $state(-1);

    let previewUrl = $state('');
    const previewKey = $derived(JSON.stringify(editor.design));
    $effect(() => {
        void previewKey;
        let cancelled = false;
        void render(editor.design).then(url => { if (!cancelled) previewUrl = url; });
        return () => { cancelled = true; };
    });

    async function render(design: LabelDesign): Promise<string> {
        try {
            const image = compositePage(await rasterizeDesign(design), { inks: design.paper?.inks });
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            canvas.getContext('2d')?.putImageData(
                new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0
            );
            return canvas.toDataURL();
        } catch {
            return '';
        }
    }

    function set(name: string, value: unknown): void {
        editor.applyParamValues({ [name]: value });
    }

    function sourceLabel(): string {
        if (entry?.origin?.kind === 'bundled') return 'Built-in collection';
        if (entry?.origin?.kind === 'community') return entry.origin.provider;
        return 'Your catalogue';
    }

    function designedSize(): string {
        const size = tpl.adaptivity.designedFor;
        const length = size.labelLengthMm === undefined ? 'auto length' : `${size.labelLengthMm} mm`;
        return `${size.tapeWidthMm} mm × ${length}`;
    }

    function paperSize(): string {
        if (!paper) return 'No paper selected';
        return paper.labelLengthMm
            ? `${paper.tapeWidthMm} × ${paper.labelLengthMm} mm`
            : `${paper.tapeWidthMm} mm continuous`;
    }

    function range(lo: number | undefined, hi: number | undefined): string {
        if (lo === undefined && hi === undefined) return 'Not restricted';
        if (lo !== undefined && hi !== undefined) return lo === hi ? `${lo} mm` : `${lo}–${hi} mm`;
        return lo !== undefined ? `From ${lo} mm` : `Up to ${hi} mm`;
    }

    function photoAt(index: number): TemplateImage | undefined {
        return index >= 0 ? photos[index] : undefined;
    }
</script>

<div class="detail-page">
    <div class="crumbs"><span>Designs</span><Icon name="chevron-down" size={12} /><strong>{tpl.name}</strong></div>

    <div class="product-layout">
        <section class="media-column" aria-label="Design preview">
            <div class="preview-card">
                <div class="preview-topline">
                    <span class="live"><span></span> Live preview</span>
                    <span class="source">{sourceLabel()}</span>
                </div>

                <div class="stage" class:photo={selectedPhoto >= 0}>
                    {#if photoAt(selectedPhoto)}
                        <img class="photo-image" src={photoAt(selectedPhoto)!.src} alt={photoAt(selectedPhoto)!.alt} />
                    {:else if previewUrl}
                        <img class="label-image" src={previewUrl} alt={`Live preview of ${tpl.name}`} />
                    {:else}
                        <span class="placeholder"></span>
                    {/if}
                </div>

                {#if selectedPhoto >= 0 && photoAt(selectedPhoto)}
                    <p class="caption">{photoAt(selectedPhoto)!.alt}{#if photoAt(selectedPhoto)!.credit} · {photoAt(selectedPhoto)!.credit}{/if}</p>
                {/if}
            </div>

            {#if photos.length > 0}
                <div class="media-strip" aria-label="Preview gallery">
                    <button class:active={selectedPhoto === -1} onclick={() => (selectedPhoto = -1)}>
                        {#if previewUrl}<img src={previewUrl} alt="Live preview" />{/if}<span>Live</span>
                    </button>
                    {#each photos as photo, index (photo.src)}
                        <button class:active={selectedPhoto === index} onclick={() => (selectedPhoto = index)}>
                            <img src={photo.src} alt={photo.alt} />
                        </button>
                    {/each}
                </div>
            {/if}

            <div class="trust-row">
                <span><Icon name="check" size={15} /> Stored locally</span>
                <span><Icon name="check" size={15} /> No manufacturer lookup</span>
                <span><Icon name="check" size={15} /> Editable copy included</span>
            </div>
        </section>

        <aside class="buy-column">
            <div class="identity">
                <span class="collection">{sourceLabel()}</span>
                <h1>{tpl.name || 'Untitled design'}</h1>
                <div class="byline">
                    {#if tpl.author}<span>By <strong>{tpl.author}</strong></span>{/if}
                    {#if tpl.revision}<span>Revision {tpl.revision}</span>{/if}
                    <span>{tpl.elements.length} elements</span>
                </div>
                {#if tpl.description}<p class="summary">{tpl.description}</p>{/if}
                {#if tpl.tags?.length}
                    <div class="tags">{#each tpl.tags.slice(0, 6) as tag (tag)}<span>{tag}</span>{/each}</div>
                {/if}
            </div>

            <div class="compat" class:bad={fit === 'outside'}>
                <span class="compat-icon"><Icon name={fit === 'outside' ? 'info' : 'check'} size={17} /></span>
                <div>
                    <strong>{fit === 'designed' ? 'Made for your selected paper' : fit === 'supported' ? 'Compatible with your selected paper' : 'Different paper size selected'}</strong>
                    <span>{paper?.name ?? 'Paper'} · {paperSize()}</span>
                </div>
                <button onclick={onpaper}>Change</button>
            </div>

            <section class="personalize">
                <div class="section-title"><span>1</span><div><h2>Personalize</h2><p>See every change instantly in the preview.</p></div></div>
                {#if params.length === 0}
                    <p class="no-fields">This design has no fill-in fields and prints exactly as shown.</p>
                {:else}
                    <div class="fields">
                        {#each params as param (param.name)}
                            <label class="field">
                                <span class="label-row"><strong>{param.label}</strong>{#if param.help}<small>{param.help}</small>{/if}</span>
                                {#if param.type === 'boolean'}
                                    <span class="toggle-row"><input type="checkbox" checked={Boolean(editor.params[param.name])} onchange={e => set(param.name, e.currentTarget.checked)} /> Enable</span>
                                {:else if param.type === 'number'}
                                    <input type="number" min={param.min} max={param.max} step={param.step ?? 1}
                                        value={Number(editor.params[param.name] ?? 0)} oninput={e => set(param.name, Number(e.currentTarget.value))} />
                                {:else if param.type === 'select'}
                                    <select value={String(editor.params[param.name] ?? '')} onchange={e => set(param.name, e.currentTarget.value)}>
                                        {#each param.options ?? [] as option (option)}<option value={option}>{option}</option>{/each}
                                    </select>
                                {:else if param.type === 'color'}
                                    <input type="color" value={String(editor.params[param.name] ?? '#000000')} oninput={e => set(param.name, e.currentTarget.value)} />
                                {:else if param.type === 'date'}
                                    <input type="date" value={String(editor.params[param.name] ?? '')} oninput={e => set(param.name, e.currentTarget.value)} />
                                {:else if param.multiline}
                                    <textarea rows="3" value={String(editor.params[param.name] ?? '')} oninput={e => set(param.name, e.currentTarget.value)}></textarea>
                                {:else}
                                    <input type="text" value={String(editor.params[param.name] ?? '')} oninput={e => set(param.name, e.currentTarget.value)} />
                                {/if}
                            </label>
                        {/each}
                    </div>
                {/if}
            </section>

            <section class="print-box">
                <div class="section-title"><span>2</span><div><h2>Print your label</h2><p>Review printer settings and choose copies next.</p></div></div>
                <button class="primary print-cta" onclick={onprint}><Icon name="printer" size={18} /> Continue to print</button>
                <div class="secondary-actions">
                    <button class:on={entry?.favorite === true} onclick={onfavorite}><Icon name="star" size={15} fill={entry?.favorite === true} /> {entry?.favorite ? 'Favorited' : 'Favorite'}</button>
                    <button onclick={onedit}><Icon name="pencil" size={15} /> Edit design</button>
                </div>
            </section>
        </aside>
    </div>

    <div class="information-grid">
        <section>
            <p class="eyebrow">About this design</p>
            <h2>Ready to make your own</h2>
            <p>{tpl.description ?? 'A reusable label design from your local catalogue. Fill in its fields, preview the result and print without changing the original layout.'}</p>
            {#if tpl.author}<p class="author-note">Created by {tpl.author}{#if tpl.license}{' '}and shared under {tpl.license}{/if}.</p>{/if}
        </section>
        <section class="specs">
            <p class="eyebrow">Design specifications</p>
            <dl>
                <div><dt>Designed size</dt><dd>{designedSize()}</dd></div>
                <div><dt>Tape width support</dt><dd>{range(tpl.adaptivity.minTapeWidthMm, tpl.adaptivity.maxTapeWidthMm)}</dd></div>
                <div><dt>Length support</dt><dd>{tpl.adaptivity.autoLength ? 'Automatic' : range(tpl.adaptivity.minLabelLengthMm, tpl.adaptivity.maxLabelLengthMm)}</dd></div>
                <div><dt>Editable fields</dt><dd>{params.length}</dd></div>
                <div><dt>Authoring density</dt><dd>{tpl.adaptivity.designedFor.dpmm ? `${tpl.adaptivity.designedFor.dpmm} dpmm` : 'Not specified'}</dd></div>
                {#if tpl.license}<div><dt>Licence</dt><dd>{tpl.license}</dd></div>{/if}
            </dl>
        </section>
    </div>
</div>

<style>
    .detail-page { max-width: 1220px; margin: 0 auto; padding: 22px 8px 52px; }
    .crumbs { display: flex; align-items: center; gap: 7px; margin-bottom: 18px; color: var(--muted); font-size: 12px; }
    .crumbs :global(svg) { transform: rotate(-90deg); }
    .crumbs strong { min-width: 0; overflow: hidden; color: var(--text); text-overflow: ellipsis; white-space: nowrap; }
    .product-layout { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(330px, .8fr); gap: clamp(22px, 4vw, 52px); align-items: start; }
    .media-column { min-width: 0; }
    .preview-card { overflow: hidden; border: 1px solid var(--border); border-radius: calc(var(--card-radius, 7px) + 6px); background: var(--panel); box-shadow: var(--shadow); }
    .preview-topline { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 15px; border-bottom: 1px solid var(--border); font-family: var(--mono); font-size: 10px; letter-spacing: .06em; text-transform: uppercase; }
    .live { display: inline-flex; align-items: center; gap: 7px; color: var(--ok); }
    .live > span { width: 7px; height: 7px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 15%, transparent); }
    .source { color: var(--muted); }
    .stage { min-height: clamp(300px, 42vw, 490px); padding: clamp(28px, 6vw, 72px); box-sizing: border-box; display: flex; align-items: center; justify-content: center; background: radial-gradient(var(--dot) 1px, transparent 1.2px) 0 0 / 10px 10px, var(--tile); }
    .stage.photo { padding: 0; background: var(--panel-2); }
    .label-image { width: min(90%, 720px); max-height: 300px; object-fit: contain; image-rendering: pixelated; filter: drop-shadow(0 14px 22px rgb(0 0 0 / 22%)); }
    .photo-image { width: 100%; height: 100%; min-height: 360px; max-height: 500px; object-fit: cover; }
    .placeholder { width: 68%; height: 90px; border-radius: 5px; background: var(--panel-2); }
    .caption { margin: 0; padding: 9px 14px; border-top: 1px solid var(--border); color: var(--muted); font-size: 11px; }
    .media-strip { display: flex; gap: 9px; margin-top: 11px; overflow-x: auto; padding: 2px 2px 6px; }
    .media-strip button { position: relative; flex: 0 0 88px; height: 64px; min-height: 0; overflow: hidden; padding: 5px; border-radius: 8px; background: var(--panel); }
    .media-strip button.active { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent); }
    .media-strip img { width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; }
    .media-strip span { position: absolute; right: 4px; bottom: 3px; padding: 1px 4px; border-radius: 3px; background: rgb(0 0 0 / 60%); color: #fff; font-size: 9px; }
    .trust-row { display: flex; gap: 12px 20px; flex-wrap: wrap; padding: 15px 3px 0; color: var(--muted); font-size: 11px; }
    .trust-row span { display: inline-flex; align-items: center; gap: 5px; }
    .trust-row :global(svg) { color: var(--ok); }
    .buy-column { min-width: 0; }
    .identity { padding: 2px 0 18px; }
    .collection { color: var(--accent); font-family: var(--mono); font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .identity h1 { margin: 7px 0 9px; font-size: clamp(28px, 3.4vw, 43px); line-height: 1.05; letter-spacing: -.04em; white-space: normal; }
    .byline { display: flex; gap: 5px 13px; flex-wrap: wrap; color: var(--muted); font-size: 11px; }
    .byline span + span::before { content: '·'; margin-right: 13px; }
    .summary { margin: 14px 0 0; color: var(--muted); line-height: 1.55; }
    .tags { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 13px; }
    .tags span { padding: 3px 7px; border: 1px solid var(--border); border-radius: 999px; background: var(--panel); color: var(--muted); font-size: 10px; }
    .compat { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; margin-bottom: 12px; padding: 11px; border: 1px solid color-mix(in srgb, var(--ok) 45%, var(--border)); border-radius: 10px; background: color-mix(in srgb, var(--ok) 7%, var(--panel)); }
    .compat.bad { border-color: color-mix(in srgb, var(--warn) 55%, var(--border)); background: color-mix(in srgb, var(--warn) 8%, var(--panel)); }
    .compat-icon { display: grid; place-items: center; width: 29px; height: 29px; border-radius: 50%; background: color-mix(in srgb, var(--ok) 15%, transparent); color: var(--ok); }
    .compat.bad .compat-icon { color: var(--warn); background: color-mix(in srgb, var(--warn) 15%, transparent); }
    .compat div { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
    .compat strong { font-size: 12px; }
    .compat div span { overflow: hidden; color: var(--muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
    .compat button { min-height: 29px; padding: 4px 8px; background: transparent; font-size: 11px; box-shadow: none; }
    .personalize, .print-box { padding: 16px; border: 1px solid var(--border); background: var(--panel); }
    .personalize { border-radius: calc(var(--card-radius, 7px) + 4px) calc(var(--card-radius, 7px) + 4px) 0 0; }
    .print-box { border-top: 0; border-radius: 0 0 calc(var(--card-radius, 7px) + 4px) calc(var(--card-radius, 7px) + 4px); box-shadow: var(--shadow); }
    .section-title { display: flex; align-items: flex-start; gap: 10px; }
    .section-title > span { display: grid; place-items: center; flex: 0 0 25px; height: 25px; border-radius: 50%; background: var(--accent); color: #fff; font-family: var(--mono); font-size: 11px; font-weight: 700; }
    .section-title h2 { margin: 1px 0 0; color: var(--text); font-size: 13px; letter-spacing: 0; text-transform: none; }
    .section-title p { margin: 2px 0 0; color: var(--muted); font-size: 10px; }
    .fields { display: flex; flex-direction: column; gap: 12px; margin-top: 15px; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .label-row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
    .label-row strong { font-size: 12px; }
    .label-row small { color: var(--muted); font-size: 9px; text-align: right; }
    .field input:not([type='checkbox']):not([type='color']), .field select, .field textarea { width: 100%; background: var(--bg); }
    .field input[type='color'] { width: 100%; height: 42px; padding: 4px; }
    .toggle-row { display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: 12px; }
    .no-fields { margin: 14px 0 0; padding: 11px; border-radius: 8px; background: var(--panel-2); color: var(--muted); font-size: 12px; }
    .print-cta { width: 100%; min-height: 46px; margin-top: 15px; font-size: 14px; }
    .secondary-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 8px; }
    .secondary-actions button { min-width: 0; font-size: 11px; }
    .secondary-actions button.on { color: var(--accent); border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--panel)); }
    .information-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 22px; margin-top: 42px; padding-top: 27px; border-top: 1px solid var(--border); }
    .information-grid section { min-width: 0; }
    .eyebrow { margin: 0 0 7px; color: var(--accent); font-family: var(--mono); font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .information-grid h2 { margin: 0 0 8px; color: var(--text); font-size: 21px; letter-spacing: -.02em; text-transform: none; }
    .information-grid section > p:not(.eyebrow) { max-width: 68ch; margin: 0; color: var(--muted); line-height: 1.65; }
    .author-note { margin-top: 12px !important; font-size: 11px; }
    .specs dl { margin: 0; border-top: 1px solid var(--border); }
    .specs dl div { display: flex; justify-content: space-between; gap: 18px; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 11px; }
    .specs dt { color: var(--muted); }
    .specs dd { margin: 0; font-family: var(--mono); text-align: right; }
    @media (max-width: 900px) {
        .product-layout { grid-template-columns: 1fr; }
        .buy-column { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .identity, .compat { grid-column: 1 / -1; }
        .personalize, .print-box { border: 1px solid var(--border); border-radius: calc(var(--card-radius, 7px) + 4px); }
        .print-box { align-self: start; }
    }
    @media (max-width: 620px) {
        .detail-page { padding: 14px 0 34px; }
        .crumbs { margin: 0 4px 12px; }
        .stage { min-height: 235px; padding: 28px 18px; }
        .photo-image { min-height: 235px; }
        .trust-row { padding-inline: 4px; }
        .buy-column, .information-grid { grid-template-columns: 1fr; }
        .identity, .compat { grid-column: auto; }
        .identity h1 { font-size: 30px; }
        .information-grid { margin-top: 28px; padding: 22px 4px 0; }
        .byline span + span::before { display: none; }
    }
</style>
