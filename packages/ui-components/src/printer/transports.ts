/**
 * Transport menu contract. The app shells know their platform (browser,
 * Capacitor, Electron) and hand the designer a list of options; the UI never
 * imports transports itself, so no shell pays for another platform's bindings.
 */
import type { IDeviceTransport } from 'universal-label-core';

export interface TransportOption {
    id: string;
    label: string;
    description?: string;
    /** False renders the option disabled with `unavailableReason`. */
    available: boolean;
    unavailableReason?: string;
    /** Shows the virtual-printer profile picker when true. */
    isDummy?: boolean;
    create(): IDeviceTransport;
}
