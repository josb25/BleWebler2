<script lang="ts">
    /**
     * What the connected printer says about itself.
     *
     * The rule this component exists to enforce: **only show a row the driver
     * claims it can fill.** A battery gauge that stays empty forever on
     * hardware without a battery reading is worse than no gauge — it looks like
     * a bug, and it teaches people to distrust the rest of the panel. So every
     * row is gated on `reports`, and a claimed-but-missing value shows an
     * explicit dash rather than nothing.
     *
     * Formatting lives here rather than in the driver, because `0.15` is the
     * fact and `"15%"` is a presentation of it.
     */
    import type { PrinterStatus, StatusField } from 'universal-label-core';
    import Icon from './Icon.svelte';
    import { faultText } from '../printer/messages';

    interface Props {
        status: PrinterStatus | null;
        reports: readonly StatusField[];
    }
    let { status, reports }: Props = $props();

    const can = (f: StatusField) => reports.includes(f);

    /** Rows the driver can fill, paired with whatever has arrived so far. */
    const identityRows = $derived.by(() => {
        const id = status?.identity;
        const rows: { label: string; value?: string }[] = [];
        if (can('deviceName')) rows.push({ label: 'Name', value: id?.deviceName });
        if (can('serialNumber')) rows.push({ label: 'Serial', value: id?.serialNumber });
        if (can('firmwareVersion')) rows.push({ label: 'Firmware', value: id?.firmwareVersion });
        if (can('hardwareVersion')) rows.push({ label: 'Hardware', value: id?.hardwareVersion });
        return rows;
    });

    const percent = $derived.by(() => {
        const l = status?.battery?.level;
        return l === undefined ? null : Math.round(l * 100);
    });

    const media = $derived(status?.media);
</script>

{#if reports.length || status?.details?.length}
    <div class="status">
        {#if status?.faults?.length}
            <ul class="faults">
                {#each status.faults as fault (fault.code + (fault.raw ?? ''))}
                    <li class:blocking={fault.blocking}>
                        <Icon name={fault.blocking ? 'flag' : 'info'} size={14} />
                        {faultText(fault)}
                    </li>
                {/each}
            </ul>
        {/if}

        {#if can('battery')}
            <div class="row battery">
                <span class="label">Battery</span>
                {#if percent === null}
                    <span class="value muted">—</span>
                {:else}
                    <span class="gauge" aria-hidden="true">
                        <span class="fill" class:low={percent <= 20} style="width:{percent}%"></span>
                    </span>
                    <span class="value">
                        {percent}%{#if status?.battery?.charging}&nbsp;· charging{/if}
                    </span>
                {/if}
            </div>
        {/if}

        {#if can('media')}
            <div class="row">
                <span class="label">Loaded</span>
                <span class="value" class:muted={!media}>
                    {#if !media}
                        —
                    {:else}
                        {[
                            media.name,
                            media.widthMm !== undefined
                                ? `${media.widthMm}${media.lengthMm !== undefined ? ` × ${media.lengthMm}` : ''} mm`
                                : undefined,
                            media.kind,
                            media.remaining !== undefined ? `${media.remaining} left` : undefined
                        ].filter(Boolean).join(' · ')}
                    {/if}
                </span>
            </div>
        {/if}

        {#each identityRows as row (row.label)}
            <div class="row">
                <span class="label">{row.label}</span>
                <span class="value mono" class:muted={!row.value}>{row.value ?? '—'}</span>
            </div>
        {/each}

        {#if status?.details}
            {#each status.details as detail (detail.id)}
                <div class="row">
                    <span class="label">{detail.label}</span>
                    <span class="value" class:mono={detail.monospace}>{detail.value}</span>
                </div>
            {/each}
        {/if}
    </div>
{/if}

<style>
    .status {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 12px;
    }
    .row {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
    }
    .label {
        color: var(--muted);
        flex: 0 0 68px;
    }
    .value {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .value.muted { color: var(--muted); }
    /* Serials and firmware strings are compared character by character. */
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

    .gauge {
        flex: 0 0 56px;
        height: 8px;
        border-radius: 4px;
        background: var(--panel-2);
        border: 1px solid var(--border);
        overflow: hidden;
    }
    .fill {
        display: block;
        height: 100%;
        background: var(--ok);
    }
    .fill.low { background: var(--warn); }

    .faults {
        list-style: none;
        margin: 0 0 2px;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
    }
    .faults li {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--warn);
    }
    .faults li.blocking { color: var(--danger); }
</style>
