<script lang="ts">
    /**
     * Printer connection UI. Transport options come from the app shell; the
     * connect buttons run inside the click handler so Web Bluetooth / WebUSB
     * get the user gesture they require for their device chooser.
     */
    import { fromStore } from 'svelte/store';
    import { PrinterSession, DUMMY_PROFILES } from '../printer/session';
    import type { TransportOption } from '../printer/transports';
    import PrinterMark from './PrinterMark.svelte';
    import PrinterStatusView from './PrinterStatusView.svelte';
    import Icon from './Icon.svelte';
    import { artworkForDevice } from '../data/artwork';
    import { toPrinterError } from 'universal-label-core';
    import { errorText, canRetry } from '../printer/messages';

    interface Props {
        session: PrinterSession;
        transports: TransportOption[];
    }
    let { session, transports }: Props = $props();

    // svelte-ignore state_referenced_locally -- session identity is stable.
    const printer = fromStore(session);
    let dummyProfileIdx = $state(0);
    let driverOverride = $state('');
    let connectError = $state('');
    let refreshing = $state(false);
    let busyId = $state<string | null>(null);
    let lastTransportId = $state<string | null>(null);

    async function connect(option: TransportOption): Promise<void> {
        connectError = '';
        busyId = option.id;
        lastTransportId = option.id;
        try {
            await session.connect(
                option.create(),
                option.isDummy ? DUMMY_PROFILES[dummyProfileIdx] : undefined,
                option.isDummy ? undefined : driverOverride || undefined
            );
        } catch (err) {
            const e = toPrinterError(err);
            // Cancelling the device chooser is a choice, not a failure. Showing
            // it in red is how an app teaches people that pressing Escape broke
            // something.
            connectError = e.code === 'cancelled' ? '' : errorText(e);
        } finally {
            busyId = null;
        }
    }

    async function disconnect(): Promise<void> {
        connectError = '';
        try {
            await session.disconnect();
        } catch (err) {
            connectError = errorText(toPrinterError(err));
        }
    }

    async function refresh(): Promise<void> {
        refreshing = true;
        try {
            await session.refreshStatus();
        } finally {
            refreshing = false;
        }
    }

    const snap = $derived(printer.current);

    // Clear stale errors when the connection state transitions.
    $effect(() => {
        if (snap.state === 'connected') connectError = '';
    });

    const driverChoices = $derived(session.getDriverChoices());

    /**
     * The drawing for what actually answered, once something has. Deliberately
     * not shown while choosing a transport: at that point nobody knows which
     * printer is on the other end, and a picture of one would be a guess
     * dressed up as information.
     */
    const artwork = $derived(artworkForDevice(snap.deviceName, snap.capabilities?.driverName));
</script>

<div class="panel">
    {#if snap.state === 'disconnected' || snap.state === 'connecting'}
        <label class="driver-choice">
            <span>
                <strong>Printer protocol</strong>
                <small>Use automatic detection unless your printer is an unknown rebrand.</small>
            </span>
            <select bind:value={driverOverride} disabled={snap.state === 'connecting'}>
                <option value="">Automatic</option>
                {#each driverChoices as driver (driver.name)}
                    <option value={driver.name}>{driver.name}</option>
                {/each}
            </select>
        </label>
        <div class="options">
            {#each transports as option (option.id)}
                <div class="option" class:disabled={!option.available}>
                    <div class="text">
                        <strong>{option.label}</strong>
                        {#if option.description}<span class="desc">{option.description}</span>{/if}
                        {#if !option.available && option.unavailableReason}
                            <span class="desc warn">{option.unavailableReason}</span>
                        {/if}
                        {#if option.isDummy}
                            <label class="profile">
                                Simulate:
                                <select
                                    onchange={e => (dummyProfileIdx = Number(e.currentTarget.value))}
                                >
                                    {#each DUMMY_PROFILES as p, i (p.label)}
                                        <option value={i} selected={i === dummyProfileIdx}>{p.label}</option>
                                    {/each}
                                </select>
                            </label>
                        {/if}
                    </div>
                    <button
                        class="primary"
                        disabled={!option.available || snap.state === 'connecting'}
                        onclick={() => connect(option)}
                    >
                        {busyId === option.id && snap.state === 'connecting' ? 'Connecting…' : 'Connect'}
                    </button>
                </div>
            {/each}
        </div>
    {:else}
        <div class="connected">
            {#if artwork}
                <!-- Blue is "connected" on this hardware, per the driver, so
                     the drawing shows the same light the machine on the desk
                     is showing. -->
                <PrinterMark
                    {artwork}
                    size={76}
                    led={artwork.ledStates?.blue ? 'blue' : 'off'}
                    strokePx={0.8}
                    hoverAnimation
                />
            {:else}
                <span class="mark-fallback"><Icon name="printer" size={24} /></span>
            {/if}
            <div class="text">
                <strong>{snap.deviceName ?? 'Unknown device'}</strong>
                {#if snap.capabilities}
                    <span class="desc">
                        {snap.capabilities.driverName ?? 'driver'} ·
                        {snap.capabilities.canvasHeightPx}px head ·
                        {snap.capabilities.dpmm} dpmm ·
                        density 1–{snap.capabilities.maxDensity}
                    </span>
                {/if}
                <PrinterStatusView status={snap.status} reports={snap.reports} />
            </div>
            <div class="actions">
                {#if snap.reports.length}
                    <!-- Battery and media go stale; identity does not. Offered
                         only where the driver can answer at all. -->
                    <button class="ghost" onclick={refresh} disabled={refreshing}>
                        {refreshing ? 'Reading…' : 'Refresh'}
                    </button>
                {/if}
                <button onclick={disconnect} disabled={snap.state === 'printing'}>Disconnect</button>
            </div>
        </div>
    {/if}

    {#if connectError || snap.lastError}
        <div class="error">
            <span>{connectError || (snap.lastError ? errorText(snap.lastError) : '')}</span>
            {#if snap.lastError && canRetry(snap.lastError) && snap.state === 'disconnected'}
                <!-- Offered from the error's own `retryable`, so a retry never
                     appears on something retrying cannot fix. -->
                <button class="ghost" onclick={() => {
                    const last = transports.find(t => t.id === lastTransportId);
                    connect(last ?? transports[0]);
                }}>Try again</button>
            {/if}
        </div>
    {/if}
</div>

<style>
    .panel {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .options {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .driver-choice {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px;
        background: var(--panel);
        border-radius: 2px;
    }
    .driver-choice span {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    .driver-choice small {
        color: var(--muted);
        font-size: 12px;
    }
    .option,
    .connected {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px;
        background: var(--panel);
        border-radius: 2px;
    }
    .option.disabled {
        opacity: 0.6;
    }
    .text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }
    /* The drawing and the text are one unit; the button stays at the far end. */
    .connected .text {
        flex: 1;
    }
    .mark-fallback {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        flex: none;
        color: var(--muted);
    }
    .desc {
        color: var(--muted);
        font-size: 12px;
    }
    .desc.warn {
        color: var(--warn);
    }
    .profile {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        margin-top: 4px;
    }
    .error {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        color: var(--danger);
        font-size: 13px;
        padding: 6px 10px;
        background: var(--panel);
        border-radius: 2px;
    }
    .actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: none;
    }
    @media (max-width: 520px) {
        .option,
        .connected,
        .driver-choice {
            align-items: flex-start;
            flex-wrap: wrap;
        }
        .option .text { flex: 1 1 190px; }
        .connected .text { flex: 1 1 calc(100% - 90px); }
        .actions {
            width: 100%;
            justify-content: flex-end;
        }
    }
</style>
