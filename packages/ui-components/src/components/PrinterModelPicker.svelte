<script lang="ts">
    import { PRINTER_PROFILES } from '../stores/settings.svelte';
    import { artworkFor } from '../data/artwork';
    import {
        matchOpenTlpDevice,
        getOpenTlpSearchTerms,
        OPENTLP_CATALOGUE_URL,
        OPENTLP_SNAPSHOT,
    } from '../data/opentlp-catalogue';
    import PrinterMark from './PrinterMark.svelte';
    import Icon from './Icon.svelte';

    interface Props {
        selectedId?: string;
        onselect: (id: string) => void;
    }

    let { selectedId, onselect }: Props = $props();

    let searchQuery = $state('');

    const isNone = $derived(!selectedId || selectedId === 'none');

    const profileEntries = $derived(
        PRINTER_PROFILES.map((p) => ({
            profile: p,
            opentlp: matchOpenTlpDevice(p),
        }))
    );

    const filteredProfiles = $derived.by(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) {
            return profileEntries;
        }
        const tokens = q.split(/\s+/).filter(Boolean);
        return profileEntries.filter(({ profile, opentlp }) => {
            const haystack = getOpenTlpSearchTerms(profile, opentlp).join(' ').toLowerCase();
            return tokens.every((token) => haystack.includes(token));
        });
    });

    const showNone = $derived.by(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return true;
        const tokens = q.split(/\s+/).filter(Boolean);
        const noneText = 'none raw continuous generic fallback default';
        return tokens.every((token) => noneText.includes(token));
    });
</script>

<div class="picker-container">
    <div class="picker-header">
        <div class="search-wrap">
            <span class="search-icon"><Icon name="search" size={15} /></span>
            <input
                type="search"
                class="search-input"
                placeholder="Search models, brands, protocols..."
                bind:value={searchQuery}
                aria-label="Filter printer models"
            />
            {#if searchQuery}
                <button
                    type="button"
                    class="clear-btn"
                    onclick={() => (searchQuery = '')}
                    aria-label="Clear search"
                >
                    &times;
                </button>
            {/if}
        </div>
        <div class="catalogue-bar">
            <span class="catalogue-hint">BleWebler2-supported models &bull; OpenTLP snapshot {OPENTLP_SNAPSHOT.generated}</span>
            <a
                href={OPENTLP_CATALOGUE_URL}
                target="_blank"
                rel="noopener noreferrer"
                class="catalogue-link"
                title="Browse full Open Thermal Label Printer catalogue"
            >
                <span>OpenTLP catalogue</span>
                <Icon name="external-link" size={12} />
            </a>
        </div>
    </div>

    {#if !showNone && filteredProfiles.length === 0}
        <div class="empty-state">
            <span class="empty-icon"><Icon name="search" size={28} /></span>
            <p class="empty-title">No matching printer models</p>
            <p class="empty-hint">
                No supported profile matches "{searchQuery}". Note that only supported profiles are selectable in BleWebler2.
            </p>
            <button type="button" class="reset-search-btn" onclick={() => (searchQuery = '')}>
                Clear search
            </button>
        </div>
    {:else}
        <div class="printer-grid">
            {#if showNone}
                <button
                    type="button"
                    class="printer-card"
                    class:on={isNone}
                    aria-pressed={isNone}
                    aria-label="None (Raw continuous data)"
                    onclick={() => onselect('none')}
                >
                    <span class="card-icon"><Icon name="printer" size={36} /></span>
                    <span class="card-name">Raw continuous</span>
                    <strong class="card-model">None</strong>
                </button>
            {/if}
            {#each filteredProfiles as { profile: p, opentlp } (p.id)}
                {@const art = artworkFor(p)}
                {@const brandLabel = p.rebadgeOnly ? `${p.brand}-compatible` : p.brand}
                {@const isSelected = !isNone && selectedId === p.id}
                <button
                    type="button"
                    class="printer-card"
                    class:on={isSelected}
                    aria-pressed={isSelected}
                    aria-label="{brandLabel} {p.model}{opentlp?.family ? ` (${opentlp.family})` : ''}"
                    onclick={() => onselect(p.id)}
                >
                    {#if art}
                        <PrinterMark artwork={art} size={72} strokePx={0.8} title={p.model} />
                    {:else}
                        <span class="card-icon"><Icon name="printer" size={36} /></span>
                    {/if}
                    <span class="card-name">{brandLabel}</span>
                    <strong class="card-model">{p.model}</strong>
                    {#if opentlp && (opentlp.family || opentlp.status)}
                        <span class="card-meta">
                            {#if opentlp.family}
                                <span class="meta-tag">{opentlp.family}</span>
                            {/if}
                            {#if opentlp.status}
                                <span
                                    class="meta-status status-{opentlp.status}"
                                    title="OpenTLP catalogue status"
                                >OpenTLP: {opentlp.status}</span>
                            {/if}
                        </span>
                    {/if}
                </button>
            {/each}
        </div>
    {/if}
</div>

<style>
    .picker-container {
        display: flex;
        flex-direction: column;
        gap: 10px;
        width: 100%;
    }
    .picker-header {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .search-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        background: var(--panel-2);
        border: 1px solid var(--border);
        border-radius: 8px;
        color: var(--text);
        transition: border-color 0.15s ease;
    }
    .search-wrap:focus-within {
        border-color: var(--accent);
    }
    .search-icon {
        display: inline-flex;
        align-items: center;
        color: var(--muted);
        flex-shrink: 0;
    }
    .search-input {
        flex: 1;
        min-width: 0;
        border: none;
        background: transparent;
        color: inherit;
        font: inherit;
        font-size: 13px;
        outline: none;
        padding: 0;
    }
    .search-input::placeholder {
        color: var(--muted);
    }
    .clear-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border: none;
        background: var(--border);
        color: var(--muted);
        border-radius: 50%;
        cursor: pointer;
        font-size: 13px;
        line-height: 1;
        padding: 0;
    }
    .clear-btn:hover {
        color: var(--text);
    }
    .catalogue-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
        font-size: 11px;
        color: var(--muted);
        padding: 0 2px;
    }
    .catalogue-hint {
        line-height: 1.4;
    }
    .catalogue-link {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: var(--accent);
        text-decoration: none;
        font-weight: 500;
        font-size: 11px;
        white-space: nowrap;
    }
    .catalogue-link:hover {
        text-decoration: underline;
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
        justify-content: center;
        gap: 4px;
        padding: 12px 8px;
        background: var(--panel-2);
        border: 1px solid var(--border);
        border-radius: 12px;
        cursor: pointer;
        color: inherit;
        font: inherit;
        text-align: center;
        box-shadow: none;
        transition: border-color 0.15s ease, background 0.15s ease;
    }
    .printer-card:hover {
        border-color: var(--accent);
    }
    .printer-card.on {
        border-color: var(--accent);
        background: color-mix(in srgb, var(--accent) 8%, var(--panel-2));
    }
    .card-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 72px;
        color: var(--muted);
    }
    .card-name {
        font-size: 11px;
        color: var(--muted);
    }
    .card-model {
        font-size: 13px;
        color: var(--text);
    }
    .card-meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 3px;
        margin-top: 2px;
        max-width: 100%;
    }
    .meta-tag,
    .meta-status {
        font-size: 10px;
        font-weight: 500;
        line-height: 1.2;
        padding: 1px 4px;
        border-radius: 4px;
        background: var(--panel);
        color: var(--muted);
        border: 1px solid var(--border);
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .meta-status {
        text-transform: capitalize;
    }
    .meta-status.status-verified {
        color: var(--accent);
        border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
    }
    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 32px 16px;
        text-align: center;
        background: var(--panel-2);
        border: 1px dashed var(--border);
        border-radius: 12px;
        color: var(--muted);
    }
    .empty-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--muted);
        margin-bottom: 2px;
    }
    .empty-title {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        color: var(--text);
    }
    .empty-hint {
        margin: 0;
        font-size: 12px;
        max-width: 320px;
        line-height: 1.4;
    }
    .reset-search-btn {
        margin-top: 6px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 500;
        border-radius: 6px;
        background: var(--panel);
        border: 1px solid var(--border);
        color: var(--text);
        cursor: pointer;
    }
    .reset-search-btn:hover {
        border-color: var(--accent);
        color: var(--accent);
    }
    @media (max-width: 420px) {
        .printer-grid {
            grid-template-columns: 1fr 1fr;
            gap: 8px;
        }
        .catalogue-bar {
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
        }
    }
</style>
