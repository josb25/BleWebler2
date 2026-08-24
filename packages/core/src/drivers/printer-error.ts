/**
 * Why an operation on a printer failed.
 *
 * The *code* is the contract and the message is a developer aid. A UI maps
 * {@link PrinterErrorCode} to its own strings and shows `message` only for
 * `'unknown'`.
 *
 * This is about operations. Something wrong with the machine itself — no paper,
 * open cover, overheated — is a reading rather than a failure and belongs in
 * `printer-status.ts`. The two meet at {@link PrinterErrorCode} `'device-fault'`,
 * which is an operation that failed *because* of a fault, and carries it.
 */
import type { PrinterFault } from './printer-status';

export type PrinterErrorCode =
    /** No transport bound, or it dropped before the call. */
    | 'not-connected'
    /** The link failed mid-operation: BLE dropped, USB unplugged. */
    | 'transport'
    /** The printer stopped answering. Usually worth retrying. */
    | 'timeout'
    /** The device answered, but not in a shape this driver understands. */
    | 'protocol'
    /** The printer refused because something is physically wrong with it. */
    | 'device-fault'
    /** This model or firmware cannot do what was asked. Retrying will not help. */
    | 'unsupported'
    /** The browser or OS denied access — Web Bluetooth permission, HTTPS. */
    | 'permission'
    /** The user stopped it. Not a failure; must never be reported as one. */
    | 'cancelled'
    | 'unknown';

/**
 * Whether trying again could plausibly work.
 *
 * Kept as data rather than left to each call site's judgement, because that
 * judgement is really a property of the code and duplicating it is how a
 * "Retry" button ends up offered on `'unsupported'`.
 */
const RETRYABLE: ReadonlySet<PrinterErrorCode> = new Set([
    'timeout', 'transport', 'not-connected', 'device-fault'
]);

export class PrinterError extends Error {
    readonly code: PrinterErrorCode;
    /** The fault behind a `'device-fault'`, where the printer named one. */
    readonly fault?: PrinterFault;

    /** What this wraps, where it wraps something. */
    readonly cause?: unknown;

    constructor(
        code: PrinterErrorCode,
        message: string,
        options?: { cause?: unknown; fault?: PrinterFault }
    ) {
        super(message);
        // Assigned rather than passed to `super`: the ES2022 `cause` option is
        // not in this package's lib target, and the original error is far too
        // useful in a bug report to drop over a compiler setting.
        this.cause = options?.cause;
        this.name = 'PrinterError';
        this.code = code;
        this.fault = options?.fault;
    }

    get retryable(): boolean {
        return RETRYABLE.has(this.code);
    }
}

/**
 * Narrow an unknown thrown value to a {@link PrinterError}.
 *
 * `instanceof` alone is unreliable across bundles: two copies of this module —
 * which a workspace with several packages produces easily — give two distinct
 * classes, and an error thrown through one fails the check in the other. The
 * name is the fallback.
 */
export function isPrinterError(err: unknown): err is PrinterError {
    return err instanceof PrinterError
        || (err instanceof Error && err.name === 'PrinterError' && 'code' in err);
}

/**
 * Coerce anything thrown into a `PrinterError`.
 *
 * Drivers are not the only source of failures — the Web Bluetooth API throws
 * `DOMException`s of its own, and those carry the two cases users hit most:
 * they closed the device chooser, or the browser refused the request outright.
 * Reporting a cancelled chooser as an error is a small thing that makes an app
 * feel broken, so it is recognised here rather than in every call site.
 */
export function toPrinterError(err: unknown, fallback: PrinterErrorCode = 'unknown'): PrinterError {
    if (isPrinterError(err)) return err;
    if (err instanceof DOMException) {
        if (err.name === 'NotFoundError') {
            // Web Bluetooth reports "user dismissed the chooser" this way, and
            // it is the single most common outcome of pressing Connect.
            return new PrinterError('cancelled', 'Device selection was cancelled.', { cause: err });
        }
        if (err.name === 'SecurityError' || err.name === 'NotAllowedError') {
            return new PrinterError('permission', err.message, { cause: err });
        }
        if (err.name === 'NetworkError') {
            return new PrinterError('transport', err.message, { cause: err });
        }
    }
    const message = err instanceof Error ? err.message : String(err);
    return new PrinterError(fallback, message, { cause: err });
}
