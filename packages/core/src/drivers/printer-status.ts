/**
 * What a connected printer can tell you about itself.
 *
 * This replaces a single `Record<string, string>` that carried four unrelated
 * kinds of information at once, pre-formatted into prose. The cost of that
 * shape was visible at every call site: the UI located the battery by running
 * `/batt/i` over the *key names* and then displayed whatever string came back,
 * because `"15 %"` is not a number you can draw a gauge from. A driver that
 * spelled the key differently silently lost its battery reading.
 *
 * The four kinds are separated here because they behave differently:
 *
 * - {@link PrinterIdentity} is read once. A serial number does not change
 *   while the printer stays connected, so re-reading it is wasted round trips.
 * - {@link BatteryStatus} is volatile and worth polling.
 * - {@link LoadedMedia} changes when someone opens the printer and swaps a
 *   roll — rare, but an event rather than a trend.
 * - {@link PrinterFault} is what stops a print from working, so it has to be
 *   checked immediately before printing rather than merely displayed.
 *
 * Faults reported *by the printer* live here. Failures of an *operation* —
 * a connection that dropped, a write that timed out, a command the firmware
 * rejected — are a different thing and are thrown, not returned; see
 * `printer-error.ts`. A printer with an open cover is healthy hardware in a
 * state you can fix; a transport that died is not a reading at all.
 *
 * **Values, not strings.** Every field carries the raw quantity — battery as a
 * fraction, widths in millimetres — so callers can compare, threshold and
 * format for their own locale. Turning `0.15` into `"15 %"` is a decision for
 * whoever is drawing it.
 *
 * **Static product facts do not belong here.** Manufacturer, FCC id, physical
 * dimensions and manual links are documentation about a model, not readings
 * from a device; they live on the model profile. Mixing them in made every
 * consumer unable to tell what had actually been measured.
 */

/**
 * A reading a driver claims it can produce.
 *
 * Declared separately from the readings themselves so a UI can tell three
 * situations apart that otherwise all look like "no value": the printer cannot
 * report this at all, the read has not happened yet, and the read happened and
 * failed. Without this, a field that is permanently absent is indistinguishable
 * from one that is merely late, and interfaces end up showing an empty battery
 * slot forever on hardware that has no battery.
 */
export type StatusField =
    | 'battery'
    | 'charging'
    | 'deviceName'
    | 'serialNumber'
    | 'firmwareVersion'
    | 'hardwareVersion'
    | 'media'
    | 'faults';

/** Constant for the life of a connection. */
export interface PrinterIdentity {
    /** The name the printer calls itself, which may differ from the BLE name. */
    deviceName?: string;
    serialNumber?: string;
    firmwareVersion?: string;
    hardwareVersion?: string;
}

export interface BatteryStatus {
    /**
     * Charge as a fraction, 0..1.
     *
     * A fraction rather than a percentage because it composes: multiply for a
     * bar width, threshold against 0.2, format however the UI likes. Absent on
     * printers that report only whether they are charging.
     */
    level?: number;
    /** True while on external power and charging. Absent if unreported. */
    charging?: boolean;
}

/** How the loaded stock is separated into labels. */
export type MediaKind =
    | 'continuous'
    | 'gap'
    | 'black'
    | 'black-mark'
    | 'transparent'
    | 'perforated'
    | 'pvc'
    | 'heat-shrink';

/** Machine-readable identity carried by a consumable. */
export interface MediaIdentification {
    technology: 'nfc' | 'rfid' | 'cartridge-code';
    /** NFC/RFID tag UID, where the reader returns it. */
    uid?: string;
    /** Manufacturer product/barcode stored on the tag. */
    barcode?: string;
    /** Manufacturer serial stored on the consumable rather than the printer. */
    serialNumber?: string;
}

/**
 * The stock actually in the printer, where it can say.
 *
 * Worth having as data rather than prose because it can be *acted* on: a roll
 * that reports 40 mm wide stock can preselect the paper profile instead of
 * asking, and a design wider than the loaded media can be caught before it
 * prints rather than after.
 */
export interface LoadedMedia {
    kind?: MediaKind;
    widthMm?: number;
    /** Length of one label; absent on continuous stock, where it has none. */
    lengthMm?: number;
    /** Labels remaining, on rolls that count. */
    remaining?: number;
    /** Consumable identifier — an RFID roll id, a cartridge code. */
    id?: string;
    /** Human name for the stock, if the roll carries one. */
    name?: string;
    /** How the printer identified this consumable, including raw tag fields. */
    identification?: MediaIdentification;
    /** Initial quantity reported by the consumable. Units are device-defined. */
    total?: number;
    /** Quantity already consumed. Units are device-defined. */
    used?: number;
    /** Optional raw capacity value exposed by newer tags. */
    capacity?: number;
}

/**
 * Something wrong with the machine, as opposed to something wrong with a
 * request made of it.
 *
 * There is deliberately no parallel "condition" structure holding `paper: 'ok'
 * | 'out'`. Two overlapping ways to say the paper ran out is how a codebase
 * ends up with a UI that checks one and a print path that checks the other. A
 * fault list says only what is wrong; whether *nothing* is wrong or nothing is
 * *known* is answered by {@link StatusField} — a driver that lists `'faults'`
 * and returns an empty array has checked and found the printer healthy.
 */
export type FaultCode =
    | 'paper-out'
    | 'paper-jam'
    | 'cover-open'
    | 'overheated'
    | 'battery-critical'
    | 'printhead'
    | 'power'
    /** Reported by the device but not recognised. Keep `raw` for the report. */
    | 'unknown';

export interface PrinterFault {
    code: FaultCode;
    /**
     * True when printing cannot proceed at all. A low battery is a fault worth
     * showing; an open cover is a fault worth refusing on. Callers that treat
     * every fault as fatal end up blocking on warnings.
     */
    blocking: boolean;
    /** The driver's own code, verbatim — the only thing worth quoting in a bug report. */
    raw?: string;
    /**
     * Driver-supplied detail, in English and unlocalised.
     *
     * A UI should render {@link FaultCode} through its own strings and use this
     * only as a fallback for `'unknown'`, or it will show untranslated text to
     * everyone the moment the app speaks a second language.
     */
    message?: string;
}

/**
 * A driver-owned informational row for facts outside the portable contract.
 *
 * The driver owns the wording and order because only it understands the
 * manufacturer's protocol. Values are display-only: if an application needs
 * to make decisions from one, it should be promoted to a typed core field.
 */
export interface PrinterStatusDetail {
    /** Stable within the driver, used as a render key. */
    id: string;
    label: string;
    value: string;
    /** Identifiers and protocol versions are easier to compare in monospace. */
    monospace?: boolean;
}

export interface PrinterStatus {
    identity: PrinterIdentity;
    battery?: BatteryStatus;
    media?: LoadedMedia;
    /** Empty means checked and healthy; absent means not checked. */
    faults?: PrinterFault[];
    /** Ordered manufacturer-specific rows defined by the active driver. */
    details?: readonly PrinterStatusDetail[];
    /** When this was read, epoch ms. Lets a caller judge staleness itself. */
    readAt: number;
}

/**
 * The first fault that would stop a print, if any.
 *
 * Returns `null` both when the printer is healthy and when it cannot report —
 * silence must never block printing, because most hardware here reports nothing
 * at all and refusing on silence would make the app useless on the majority of
 * printers it supports. This is an early warning, not a permission check: the
 * printer stays the authority on whether it can print, and the driver will
 * still fail if it cannot.
 */
export function printBlocker(status?: PrinterStatus): PrinterFault | null {
    return status?.faults?.find(f => f.blocking) ?? null;
}

/** Faults worth showing that are not stopping anything — low battery, say. */
export function warnings(status?: PrinterStatus): PrinterFault[] {
    return status?.faults?.filter(f => !f.blocking) ?? [];
}

/** Whether a reading is old enough to be worth taking again. */
export function isStale(status: PrinterStatus | undefined, maxAgeMs: number): boolean {
    if (!status) return true;
    return Date.now() - status.readAt > maxAgeMs;
}

/**
 * Whether a driver claims a reading at all.
 *
 * The distinction that matters: `false` means "this hardware cannot tell you",
 * which is a permanent answer worth showing as such, rather than a blank that
 * looks like a value still loading.
 */
export function reports(fields: readonly StatusField[] | undefined, field: StatusField): boolean {
    return !!fields?.includes(field);
}
