/**
 * PrinterSession — the single owner of all printer/transport state.
 *
 * Wraps universal-label-core's PrintManager in an explicit state machine and
 * exposes it via the Svelte store contract (`subscribe`), keeping printer
 * lifecycle completely separate from editor/design state. The session never
 * touches the design model; it consumes finished, separated pages only.
 */
import {
    PrintManager,
    DummyDriver,
    type PrinterCapabilities,
    type UniversalPage,
    type UniversalPrintOptions,
    type IDeviceTransport,
    type IPrinterDriver,
    type PrinterStatus,
    type LoadedMedia,
    type StatusField,
    type PrinterDriverChoice,
    PrinterError,
    toPrinterError,
    printBlocker
} from 'universal-label-core';

export type PrinterState = 'disconnected' | 'connecting' | 'connected' | 'printing';

/** Simulated hardware profile applied when the Dummy (virtual) driver matches. */
export interface DummyProfile {
    label: string;
    /**
     * Which model is being stood in for. The transport reports one fixed name
     * whatever is selected, so without this the app has no way to know that
     * "simulate a P12" means a P12 — and anything keyed on the model (its
     * artwork, its documentation) falls back to a generic. Kept separate from
     * `label` so it stays a model key rather than prose.
     */
    model: string;
    heightPx: number;
    maxDensity: number;
    dpmm: number;
}

export const DUMMY_PROFILES: readonly DummyProfile[] = [
    { label: 'P12 (12mm, 96px)', model: 'P12', heightPx: 96, maxDensity: 15, dpmm: 8 },
    { label: 'P50S (384px)', model: 'P50S', heightPx: 384, maxDensity: 15, dpmm: 8 },
    { label: 'P80 (576px)', model: 'P80', heightPx: 576, maxDensity: 15, dpmm: 8 }
];

export interface PrinterSnapshot {
    state: PrinterState;
    deviceName?: string;
    capabilities?: PrinterCapabilities;
    /**
     * Typed readings from the printer. `null` until the first read, and on
     * drivers that cannot answer at all — {@link PrinterSnapshot.reports} tells
     * the two apart, so a UI can show "no battery reporting" rather than an
     * empty gauge that never fills.
     */
    status: PrinterStatus | null;
    /** What this driver claims it can report. Empty when nothing. */
    reports: readonly StatusField[];
    /**
     * The last failure, typed. Held rather than only thrown because a
     * connection can drop while nobody is awaiting anything, and that still has
     * to reach the interface.
     */
    lastError?: PrinterError;
}

type Subscriber = (snapshot: PrinterSnapshot) => void;

export class PrinterSession {
    private pm = new PrintManager();
    private snapshot: PrinterSnapshot = { state: 'disconnected', status: null, reports: [] };
    private subscribers = new Set<Subscriber>();
    private pendingDummyProfile?: DummyProfile;

    constructor() {
        this.pm.on('connected', this.handleConnected);
        this.pm.on('disconnected', () => {
            this.update({
                state: 'disconnected', deviceName: undefined,
                capabilities: undefined, status: null, reports: []
            });
        });
        this.pm.on('printing', () => this.update({ state: 'printing' }));
        this.pm.on('idle', () => {
            if (this.snapshot.state === 'printing') this.update({ state: 'connected' });
        });
        this.pm.on('error', err => this.update({ lastError: toPrinterError(err, 'transport') }));
    }

    /** Svelte store contract. */
    subscribe(run: Subscriber): () => void {
        this.subscribers.add(run);
        run(this.snapshot);
        return () => this.subscribers.delete(run);
    }

    get current(): PrinterSnapshot {
        return this.snapshot;
    }

    /**
     * Connect through a caller-supplied transport (the app shell knows the
     * platform). `dummyProfile` configures the virtual printer when the Dummy
     * driver ends up matching, so different printheads can be simulated.
     */
    async connect(transport: IDeviceTransport, dummyProfile?: DummyProfile, driverName?: string): Promise<void> {
        if (this.snapshot.state === 'connecting' || this.snapshot.state === 'printing') {
            throw new PrinterError('not-connected', `Cannot connect while ${this.snapshot.state}.`);
        }
        this.pendingDummyProfile = dummyProfile;
        this.update({ state: 'connecting', lastError: undefined });
        try {
            await this.pm.connect(transport, driverName);
        } catch (err) {
            const e = toPrinterError(err, 'transport');
            // A cancelled chooser is a decision, not a fault. Recording it as
            // `lastError` would leave a red message on screen after the user
            // simply changed their mind.
            this.update({ state: 'disconnected', lastError: e.code === 'cancelled' ? undefined : e });
            throw e;
        }
        void this.refreshStatus();
    }

    /** Hardware protocol families available for an explicit connection override. */
    getDriverChoices(): PrinterDriverChoice[] {
        return this.pm.getAvailableDriverChoices();
    }

    async disconnect(): Promise<void> {
        await this.pm.disconnect();
    }

    async print(page: UniversalPage, options: UniversalPrintOptions): Promise<void> {
        if (this.snapshot.state !== 'connected') {
            throw new PrinterError('not-connected', 'No printer connected.');
        }
        // Refuse on a fault the printer has already told us about, rather than
        // sending a job into an open cover and reporting success. Silence is
        // not a fault: most supported hardware reports nothing, and blocking on
        // that would make the app useless on the majority of it.
        const blocker = printBlocker(this.snapshot.status ?? undefined);
        if (blocker) {
            throw new PrinterError('device-fault', `Printer not ready: ${blocker.code}.`, { fault: blocker });
        }
        try {
            await this.pm.print(page, options);
        } catch (err) {
            const e = toPrinterError(err, 'transport');
            this.update({ lastError: e });
            throw e;
        }
    }

    private handleConnected = (driver: IPrinterDriver) => {
        // The PrintManager constructor auto-registers the DummyDriver; the only
        // supported way to configure it is after it has been matched.
        let simulated: string | undefined;
        if (this.pendingDummyProfile && driver instanceof DummyDriver) {
            const p = this.pendingDummyProfile;
            driver.setConfig(p.heightPx, p.maxDensity, p.dpmm, { type: 'monochrome' });
            // The dummy transport reports one fixed name for every profile, so
            // the chosen model is named here instead. "Virtual" stays in front:
            // this is a simulation and should never read as real hardware.
            simulated = `Virtual ${p.model}`;
        }
        this.pendingDummyProfile = undefined;
        this.update({
            state: 'connected',
            deviceName: simulated ?? this.pm.getConnectedDeviceName(),
            capabilities: this.pm.getCapabilities(),
            reports: this.pm.getReportedFields(),
            status: null,
            lastError: undefined
        });
    };

    /**
     * Re-read the printer's state.
     *
     * Public because battery and media go stale while identity does not, so the
     * interface — which knows when it is showing them — decides when to ask
     * again. Never throws: a failed read is a missing value, not an error worth
     * interrupting anyone over, and it must not turn into a red banner when the
     * user has done nothing wrong.
     */
    async refreshStatus(): Promise<void> {
        try {
            const status = await this.pm.getStatus();
            // The read is slow enough that a disconnect can land mid-flight;
            // writing then would attach a reading to nothing.
            if (this.snapshot.state === 'connected' || this.snapshot.state === 'printing') {
                this.update({ status });
            }
        } catch {
            // Best-effort: much of the supported hardware simply does not answer.
        }
    }

    /** Resolve catalogue-only media facts through the connected driver. */
    async resolveMedia(media: LoadedMedia): Promise<LoadedMedia> {
        const resolved = await this.pm.resolveMedia(media);
        const current = this.snapshot.status?.media;
        if (
            current
            && (this.snapshot.state === 'connected' || this.snapshot.state === 'printing')
            && (current === media || (current.id !== undefined && current.id === media.id))
        ) {
            this.update({
                status: { ...this.snapshot.status!, media: resolved, readAt: Date.now() }
            });
        }
        return resolved;
    }

    private update(patch: Partial<PrinterSnapshot>): void {
        this.snapshot = { ...this.snapshot, ...patch };
        for (const run of this.subscribers) run(this.snapshot);
    }
}
