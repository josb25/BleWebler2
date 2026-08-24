/**
 * Every user-facing sentence about a printer, in one file.
 *
 * The core packages deal in codes — `'timeout'`, `'cover-open'` — and never in
 * prose, so that a failure means the same thing to a test, a log and a screen.
 * Turning a code into a sentence is a UI job, and collecting those sentences
 * here means the day this app speaks a second language there is exactly one
 * list to translate rather than a phrase buried in each component.
 *
 * Driver-supplied text is used only where no code exists to translate — an
 * `'unknown'` fault, whose whole meaning is "the printer said something we do
 * not model".
 */
import type { PrinterError, PrinterErrorCode, PrinterFault, FaultCode } from 'universal-label-core';

const ERROR_TEXT: Record<PrinterErrorCode, string> = {
    'not-connected': 'No printer connected.',
    'transport': 'Lost the connection to the printer.',
    'timeout': 'The printer stopped responding.',
    'protocol': 'The printer replied in a way this driver did not expect.',
    'device-fault': 'The printer is not ready.',
    'unsupported': 'This printer cannot do that.',
    'permission': 'The browser blocked access to the device.',
    'cancelled': 'Cancelled.',
    'unknown': 'Something went wrong talking to the printer.'
};

const FAULT_TEXT: Record<FaultCode, string> = {
    'paper-out': 'Out of paper',
    'paper-jam': 'Paper jam',
    'cover-open': 'Cover open',
    'overheated': 'Printhead too hot',
    'battery-critical': 'Battery critically low',
    'printhead': 'Printhead fault',
    'power': 'Power fault',
    'unknown': 'Reported a fault'
};

/**
 * A sentence for a failure, with the specific cause appended where one exists.
 *
 * A device fault gets named — "The printer is not ready" alone leaves someone
 * staring at a machine wondering which of five things to check, when the driver
 * already knows it is the cover.
 */
export function errorText(err: PrinterError): string {
    const base = ERROR_TEXT[err.code] ?? ERROR_TEXT.unknown;
    if (err.code === 'device-fault' && err.fault) return `${base} ${faultText(err.fault)}.`;
    // The raw message is a developer aid, not a translated string, so it only
    // appears where nothing better exists.
    if (err.code === 'unknown' && err.message) return err.message;
    return base;
}

export function faultText(fault: PrinterFault): string {
    return fault.code === 'unknown'
        ? (fault.message ?? FAULT_TEXT.unknown)
        : FAULT_TEXT[fault.code];
}

/** Whether to offer a retry, from the error itself rather than per call site. */
export function canRetry(err: PrinterError): boolean {
    return err.retryable;
}
