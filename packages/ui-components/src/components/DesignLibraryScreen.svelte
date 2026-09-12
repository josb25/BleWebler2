<script lang="ts">
    /** One catalogue for all ULT designs; fields and adaptivity are capabilities. */
    import { untrack } from 'svelte';
    import Icon from './Icon.svelte';
    import Sheet from './Sheet.svelte';
    import type { InkBinding, PaperProfile } from 'universal-label-core';
    import {
        compositePage, mediaFit, rasterizeDesign, resolveTemplate,
        type DesignOrigin, type LabelDesign, type LabelTemplate, type MediaFit, type SavedLabel
    } from 'universal-label-renderer';
    import type { TemplateSession } from '../stores/templates.svelte';

    export interface PreviewMedia {
        pxPerMm: number;
        printheadPx: number;
        tapeWidthMm: number;
        labelLengthMm?: number;
        name?: string;
    }

    interface Props {
        session: TemplateSession;
        media: PreviewMedia;
        onopen: (tpl: LabelTemplate, paper?: PaperProfile, inkBindings?: InkBinding[], origin?: DesignOrigin) => void;
        onnew: () => void;
        onuse: (tpl: LabelTemplate, origin?: DesignOrigin) => void;
        onedit: (tpl: LabelTemplate, origin?: DesignOrigin) => void;
    }
    let { session, media, onopen, onnew, onuse, onedit }: Props = $props();

    // Reactive: reads session.list() which bumps version on every mutation.
    let entries = $derived(session.list());
    let thumbs = $state<Record<string, string>>({});
    let importInput = $state<HTMLInputElement | null>(null);
    let search = $state('');
    let scope = $state<'all' | 'favorites' | 'fillable'>('all');
    let fitsOnly = $state(false);
    let dropping = $state(false);
    let dragDepth = 0;
    let importReport = $state<{ ok: number; failed: Array<{ name: string; error: string }> } | null>(null);
    let pendingDelete = $state<string | null>(null);
    const renderingThumbs = new Set<string>();
    let activeThumbKeys = new Set<string>();

    // Re-render thumbnails when entries change. Cache reads and writes stay
    // untracked so each completed thumbnail does not restart this effect.
    $effect(() => {
        const snapshot = entries;
        untrack(() => {
            const activeKeys = new Set(snapshot.map(entry => `${entry.template.id}#${entry.savedAt}`));
            activeThumbKeys = activeKeys;
            const retained = Object.fromEntries(
                Object.entries(thumbs).filter(([key]) => activeKeys.has(key))
            ) as Record<string, string>;
            if (Object.keys(retained).length !== Object.keys(thumbs).length) thumbs = retained;
            void renderThumbs(snapshot);
        });
    });

    /** Render the recognizable authored design; media compatibility is separate. */
    function resolveAtDesigned(tpl: LabelTemplate): LabelDesign {
        const df = tpl.adaptivity.designedFor;
        const dpmm = df.dpmm ?? 8;
        const lengthMm = df.labelLengthMm ?? 40;
        return resolveTemplate(tpl, {
            widthPx: Math.max(8, Math.round(lengthMm * dpmm)),
            heightPx: Math.max(8, Math.round(df.tapeWidthMm * dpmm)),
            tapeWidthMm: df.tapeWidthMm,
            labelLengthMm: lengthMm
        }).design;
    }

    async function toThumb(design: LabelDesign): Promise<string> {
        const image = compositePage(await rasterizeDesign(design), { inks: design.paper?.inks });
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        canvas.getContext('2d')?.putImageData(
            new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0
        );
        return canvas.toDataURL();
    }

    async function renderThumbs(snapshot: SavedLabel[]): Promise<void> {
        for (const entry of snapshot) {
            const key = `${entry.template.id}#${entry.savedAt}`;
            if (thumbs[key] || renderingThumbs.has(key)) continue;
            renderingThumbs.add(key);
            try {
                const thumbnail = await toThumb(resolveAtDesigned(entry.template));
                if (activeThumbKeys.has(key)) thumbs = { ...thumbs, [key]: thumbnail };
            } catch (error) {
                if (import.meta.env.DEV) console.warn('[DesignLibrary] thumbnail failed:', error);
            } finally {
                renderingThumbs.delete(key);
            }
        }
    }

    const query = $derived(search.trim().toLowerCase());
    const searching = $derived(query !== '');
    const fillableCount = $derived(entries.filter(entry => entry.template.params.length > 0).length);
    const favoriteCount = $derived(entries.filter(entry => entry.favorite === true).length);
    const fitOf = (tpl: LabelTemplate): MediaFit => mediaFit(tpl, media.tapeWidthMm, media.labelLengthMm);
    const offSizeCount = $derived(entries.filter(entry => fitOf(entry.template) === 'outside').length);
    const mediaLabel = $derived(
        media.labelLengthMm ? `${media.tapeWidthMm} × ${media.labelLengthMm} mm` : `${media.tapeWidthMm} mm tape`
    );
    const visible = $derived(entries.filter(entry => {
        const tpl = entry.template;
        const text = `${tpl.name} ${tpl.description ?? ''} ${(tpl.tags ?? []).join(' ')}`.toLowerCase();
        return (!query || text.includes(query))
            && (scope !== 'favorites' || entry.favorite === true)
            && (scope !== 'fillable' || tpl.params.length > 0)
            && (!fitsOnly || fitOf(tpl) !== 'outside');
    }));

    function copy(tpl: LabelTemplate): LabelTemplate {
        return JSON.parse(JSON.stringify(tpl)) as LabelTemplate;
    }
    /** Fill reusable designs; directly edit fixed designs. */
    function open(entry: SavedLabel): void {
        if (entry.template.params.length > 0) onuse(copy(entry.template), entry.origin);
        else onopen(copy(entry.template), entry.paper, entry.inkBindings, entry.origin);
    }
    function edit(entry: SavedLabel): void { onedit(copy(entry.template), entry.origin); }
    function toggleFavorite(id: string): void { session.toggleFavorite(id); }
    function confirmDelete(id: string): void { pendingDelete = id; }
    function cancelDelete(): void { pendingDelete = null; }
    function executeDelete(): void {
        if (pendingDelete === null) return;
        session.remove(pendingDelete);
        pendingDelete = null;
    }

    function sizeLabel(tpl: LabelTemplate): string {
        const df = tpl.adaptivity.designedFor;
        const length = Math.round((df.labelLengthMm ?? 40) * 10) / 10;
        const width = Math.round(df.tapeWidthMm * 10) / 10;
        return `${width} × ${length} mm`;
    }
    function sourceLabel(entry: SavedLabel): string | undefined {
        if (entry.origin?.kind === 'bundled') return 'Built in';
        if (entry.origin?.kind === 'community') return entry.origin.provider;
        return undefined;
    }

    async function importFiles(files: Iterable<File> | null): Promise<void> {
        const list = [...(files ?? [])].filter(file => /\.json$/i.test(file.name));
        if (list.length === 0) {
            importReport = { ok: 0, failed: [{ name: '—', error: 'No JSON design files found.' }] };
            return;
        }
        let ok = 0;
        const failed: Array<{ name: string; error: string }> = [];
        for (const file of list) {
            try {
                const result = session.importJSON(await file.text());
                if (result.ok) ok++;
                else failed.push({ name: file.name, error: result.errors.slice(0, 2).join('; ') });
            } catch (error) {
                failed.push({ name: file.name, error: error instanceof Error ? error.message : String(error) });
            }
        }
        importReport = { ok, failed };
    }
    function onDragEnter(event: DragEvent): void {
        if (!event.dataTransfer?.types.includes('Files')) return;
        dragDepth++;
        dropping = true;
    }
    function onDragLeave(): void {
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) dropping = false;
    }
    function onDragOver(event: DragEvent): void {
        if (!event.dataTransfer?.types.includes('Files')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
    }
    function onDrop(event: DragEvent): void {
        event.preventDefault();
        dragDepth = 0;
        dropping = false;
        void importFiles(event.dataTransfer?.files ?? null);
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -- keyboard import sits beside New design. -->
<div class="library" class:dropping ondragenter={onDragEnter} ondragleave={onDragLeave} ondragover={onDragOver} ondrop={onDrop}>
    <header class="hero">
        <h1>Designs</h1>
        <div class="hero-actions">
            <button class="primary" onclick={onnew}><Icon name="plus" size={16} /> New design</button>
            <button onclick={() => importInput?.click()} title="Import one or more ULT JSON designs"><Icon name="upload" size={16} /> Import</button>
            <input bind:this={importInput} type="file" accept=".json,application/json" multiple hidden
                onchange={event => { void importFiles(event.currentTarget.files); event.currentTarget.value = ''; }} />
        </div>
    </header>

    <div class="catalogue-bar">
        <div class="search">
            <Icon name="search" size={16} />
            <input type="search" placeholder="Search designs" bind:value={search} />
            {#if searching}<button class="clear" title="Clear search" aria-label="Clear search" onclick={() => (search = '')}><Icon name="x" size={14} /></button>{/if}
        </div>
        <div class="scopes" aria-label="Design filters">
            <button class:active={scope === 'all'} aria-pressed={scope === 'all'} onclick={() => (scope = 'all')}>All <span>{entries.length}</span></button>
            <button class:active={scope === 'favorites'} aria-pressed={scope === 'favorites'} onclick={() => (scope = 'favorites')}><Icon name="star" size={13} /> Favorites <span>{favoriteCount}</span></button>
            <button class:active={scope === 'fillable'} aria-pressed={scope === 'fillable'} onclick={() => (scope = 'fillable')}>With fields <span>{fillableCount}</span></button>
        </div>
        {#if offSizeCount > 0 || fitsOnly}
            <button class="fit-filter" class:active={fitsOnly} aria-pressed={fitsOnly} onclick={() => (fitsOnly = !fitsOnly)}
                title={fitsOnly ? `Showing designs that fit ${mediaLabel}` : `Hide ${offSizeCount} designs that do not fit ${mediaLabel}`}>
                <Icon name={fitsOnly ? 'check' : 'tag'} size={13} /> Fits {mediaLabel}
            </button>
        {/if}
    </div>

    {#if importReport}
        <div class="import-report" class:bad={importReport.failed.length > 0}>
            <span>{#if importReport.ok > 0}Imported {importReport.ok} design{importReport.ok === 1 ? '' : 's'}.{/if} {#if importReport.failed.length > 0}{importReport.failed.length} could not be read.{/if}</span>
            {#if importReport.failed.length > 0}<ul>{#each importReport.failed as failure (failure.name)}<li><strong>{failure.name}</strong> — {failure.error}</li>{/each}</ul>{/if}
            <button onclick={() => (importReport = null)}>Dismiss</button>
        </div>
    {/if}

    <div class="results-head">
        <h2>{scope === 'favorites' ? 'Favorite designs' : scope === 'fillable' ? 'Designs with fields' : 'All designs'}</h2>
        <span>{visible.length}{visible.length !== entries.length ? ` of ${entries.length}` : ''}</span>
    </div>

    {#if entries.length === 0}
        <div class="empty"><Icon name="tag" size={42} /><h2>Create your first design</h2><p>Start from a blank label or import an existing ULT design.</p><button class="primary" onclick={onnew}><Icon name="plus" size={16} /> New design</button></div>
    {:else if visible.length === 0}
        <div class="empty"><Icon name="search" size={42} /><h2>No matching designs</h2><p>Try another search or clear one of the filters.</p><button onclick={() => { search = ''; scope = 'all'; fitsOnly = false; }}>Clear filters</button></div>
    {:else}
        <div class="gallery">
            {#each visible as entry (`${entry.template.id}#${entry.savedAt}`)}
                <article class="card">
                    <button class="thumb-button" onclick={() => open(entry)} aria-label={`Select ${entry.template.name}`}>
                        {#if thumbs[`${entry.template.id}#${entry.savedAt}`]}<img src={thumbs[`${entry.template.id}#${entry.savedAt}`]} alt={entry.template.name} />{:else}<span class="placeholder"></span>{/if}
                    </button>
                    <div class="meta">
                        <div class="title-line"><button class="name" onclick={() => open(entry)}>{entry.template.name || 'Untitled design'}</button>{#if sourceLabel(entry)}<span class="source">{sourceLabel(entry)}</span>{/if}</div>
                        {#if entry.template.description}<p class="description">{entry.template.description}</p>{/if}
                        {#if entry.template.tags?.length}<div class="tags">{#each entry.template.tags.slice(0, 3) as tag (tag)}<button onclick={() => { search = tag; scope = 'all'; fitsOnly = false; }}>{tag}</button>{/each}</div>{/if}
                        <div class="details">
                            {#if fitOf(entry.template) === 'outside'}<span class="fit off" title={`Does not fit ${mediaLabel}`}>Doesn’t fit</span>{:else if fitOf(entry.template) === 'designed'}<span class="fit exact" title={`Designed for ${mediaLabel}`}>Exact fit</span>{/if}
                            <span>{sizeLabel(entry.template)}</span><span>·</span>
                            {#if entry.template.params.length > 0}<span>{entry.template.params.length} field{entry.template.params.length === 1 ? '' : 's'}</span>{:else}<span>{entry.template.elements.length} item{entry.template.elements.length === 1 ? '' : 's'}</span>{/if}
                        </div>
                        <div class="card-actions">
                            <button class="icon star" class:active={entry.favorite === true} title={entry.favorite ? 'Remove from favorites' : 'Add to favorites'} aria-label={entry.favorite ? 'Remove from favorites' : 'Add to favorites'} onclick={() => toggleFavorite(entry.template.id)}><Icon name="star" size={15} fill={entry.favorite === true} /></button>
                            <button class="icon" title="Edit design" aria-label="Edit design" onclick={() => edit(entry)}><Icon name="pencil" size={15} /></button>
                            <button class="icon" title="Delete design" aria-label="Delete design" onclick={() => confirmDelete(entry.template.id)}><Icon name="trash" size={15} /></button>
                        </div>
                    </div>
                </article>
            {/each}
        </div>
    {/if}
</div>

{#if pendingDelete}
    <Sheet title="Delete design" onclose={cancelDelete} priority>
        <p>Delete this design? This cannot be undone.</p>
        <div class="confirm-actions">
            <button onclick={cancelDelete}>Cancel</button>
            <button class="danger" onclick={executeDelete}>Delete</button>
        </div>
    </Sheet>
{/if}

<style>
    .library { display: flex; flex-direction: column; gap: 18px; padding: 4px 0 28px; }
    .library.dropping { outline: 2px dashed var(--accent); outline-offset: 8px; border-radius: 3px; }
    .library.dropping::after { content: 'Drop design files to import'; position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 30; padding: 9px 16px; border-radius: 2px; background: var(--accent); color: #fff; font-size: 13px; font-weight: 700; box-shadow: var(--shadow); }
    .hero { display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
    .hero h1 { margin: 0; font-size: clamp(25px, 4vw, 34px); line-height: 1; letter-spacing: -.035em; }
    .hero-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .hero-actions button { min-height: 40px; }
    .catalogue-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px; border: 1px solid var(--border); border-left: 3px solid var(--accent); border-radius: 2px; background: var(--panel); }
    .search { position: relative; display: flex; align-items: center; flex: 1 1 230px; min-width: 180px; }
    .search > :global(svg) { position: absolute; left: 11px; color: var(--muted); pointer-events: none; }
    .search input { width: 100%; padding: 10px 36px; border-radius: 2px; }
    .clear { position: absolute; right: 5px; min-height: 0; padding: 5px; border: 0; background: transparent; box-shadow: none; color: var(--muted); }
    .clear:hover { transform: none; }
    .scopes { display: flex; gap: 2px; padding: 3px; border-radius: 2px; background: var(--panel-2); }
    .scopes button, .fit-filter { min-height: 32px; padding: 5px 9px; border-color: transparent; background: transparent; box-shadow: none; font-size: 12px; white-space: nowrap; }
    .scopes button:hover, .fit-filter:hover { transform: none; border-color: var(--border); }
    .scopes button.active, .fit-filter.active { background: var(--panel); border-color: var(--border); color: var(--accent); }
    .scopes button span { padding-left: 4px; color: var(--muted); font-family: var(--mono); font-size: 10px; }
    .fit-filter { border: 1px solid var(--border); }
    .results-head { display: flex; align-items: baseline; gap: 8px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
    .results-head h2 { margin: 0; font-size: 14px; letter-spacing: .08em; text-transform: uppercase; }
    .results-head span { color: var(--muted); font-family: var(--mono); font-size: 11px; }
    .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(238px, 1fr)); gap: 14px; }
    .card { position: relative; min-width: 0; overflow: hidden; border: 1px solid var(--border); border-radius: var(--card-radius, 2px); background: var(--panel); transition: border-color .12s ease, box-shadow .12s ease, transform .12s ease; }
    .card:hover { border-color: var(--accent); box-shadow: 3px 3px 0 var(--ink); transform: translate(-1px, -1px); }
    .thumb-button { position: relative; width: 100%; min-height: 118px; padding: 18px; border: 0; border-radius: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; background: radial-gradient(var(--dot) 1px, transparent 1.2px) 0 0 / 8px 8px, var(--tile); box-shadow: none; }
    .thumb-button::before { content: ''; position: absolute; inset: 8px; border: 1px dashed var(--dot); border-radius: 3px; }
    .thumb-button:hover { transform: none; box-shadow: none; }
    .thumb-button img { max-width: 100%; max-height: 82px; object-fit: contain; image-rendering: pixelated; filter: drop-shadow(0 1px 2px rgb(0 0 0 / 20%)); }
    .placeholder { width: 62%; height: 42px; border-radius: 3px; background: var(--panel-2); }
    .star.active { color: #ffd34f; }
    .meta { display: flex; flex-direction: column; gap: 7px; min-width: 0; padding: 11px 12px 10px; }
    .title-line { display: flex; align-items: flex-start; gap: 7px; }
    .name { flex: 1; min-width: 0; min-height: 0; padding: 0; border: 0; display: -webkit-box; overflow: hidden; background: transparent; box-shadow: none; color: var(--text); font-weight: 700; line-height: 1.3; text-align: left; overflow-wrap: anywhere; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
    .name:hover { transform: none; color: var(--accent); }
    .source { flex: 0 0 auto; padding: 2px 5px; border: 1px solid var(--border); border-radius: 3px; color: var(--muted); font-family: var(--mono); font-size: 9px; letter-spacing: .04em; text-transform: uppercase; }
    .description { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.4; display: -webkit-box; overflow: hidden; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
    .tags { display: flex; gap: 4px; flex-wrap: wrap; }
    .tags button { min-height: 0; padding: 2px 6px; border-radius: 2px; border-color: var(--border); background: var(--panel-2); box-shadow: none; color: var(--muted); font-size: 10px; }
    .tags button:hover { transform: none; color: var(--accent); }
    .details { min-height: 18px; display: flex; align-items: center; gap: 5px; flex-wrap: wrap; color: var(--muted); font-family: var(--mono); font-size: 10px; }
    .fit { padding: 2px 5px; border-radius: 3px; font-weight: 700; }
    .fit.exact { color: var(--ok); background: color-mix(in srgb, var(--ok) 10%, transparent); }
    .fit.off { color: var(--warn); background: color-mix(in srgb, var(--warn) 10%, transparent); }
    .card-actions { display: flex; align-items: center; justify-content: flex-end; gap: 4px; padding-top: 5px; border-top: 1px solid var(--border); }
    .icon:hover { transform: none; background: var(--panel-2); }
    .icon { min-height: 28px; width: 30px; padding: 4px; border-color: transparent; background: transparent; box-shadow: none; color: var(--muted); }
    .empty { min-height: 260px; padding: 36px 18px; border: 1px dashed var(--border); border-radius: 3px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 9px; color: var(--muted); text-align: center; }
    .empty h2, .empty p { margin: 0; }
    .empty h2 { color: var(--text); font-size: 18px; }
    .empty p { max-width: 350px; font-size: 13px; }
    .empty button { margin-top: 5px; }
    .import-report { padding: 10px 12px; border: 1px solid var(--border); border-radius: 2px; display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap; background: var(--panel); font-size: 12px; }
    .import-report.bad { border-color: var(--danger); }
    .import-report ul { flex-basis: 100%; margin: 0; padding-left: 20px; color: var(--muted); }
    .import-report button { margin-left: auto; min-height: 28px; padding: 4px 8px; }
    @media (max-width: 720px) {
        .hero { align-items: center; }
        .hero-actions { width: 100%; }
        .hero-actions button { flex: 1; }
        .catalogue-bar { align-items: stretch; }
        .search { flex-basis: 100%; }
        .scopes { width: 100%; overflow-x: auto; }
        .scopes button { flex: 1 0 auto; }
        .fit-filter { width: 100%; }
        .gallery { grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); }
    }
    @media (max-width: 480px) { .gallery { grid-template-columns: 1fr; } .thumb-button { min-height: 108px; } }
    .confirm-actions { display: flex; gap: 8px; justify-content: flex-end; }
    .confirm-actions .danger { color: #fff; background: var(--danger); }
</style>
