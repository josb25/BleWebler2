// All models untested — only A6+ BLE endpoint is hardware-observed.

import type { IDeviceTransport } from '../../core/transports/transport.interface';
import type {
    IPrinterDriver,
    PrinterCapabilities,
    PrinterModelProfile,
    UniversalPrintOptions,
} from '../driver.interface';
import { singlePlane, type UniversalPage } from '../../types/ink';
import { encodePeriPageRaster, peripageRasterHeader } from './peripage-raster';
import {
    createDensityCommand,
    createEnableCommand,
    createFeedCommand,
    createPositionCommand,
    createStopCommand,
    createWakeCommand,
    isPeriPageCompatible,
    matchPeriPageProfile,
    PERIPAGE_A6_PROFILE,
    PERIPAGE_BLE_ENDPOINTS,
    PERIPAGE_MODELS,
} from './peripage-protocol';

/**
 * Clean-room driver for PeriPage raw-raster printers (A6, A6 HD, A6+, C6, C6+, P21 SD, P21 HD).
 *
 * Excludes compressed-protocol models such as P21+ / PPG_P21+.
 * Owns its raster encoder so PeriPage can evolve independently of other brands.
 */
export class PeriPageDriver implements IPrinterDriver {
    readonly name = 'PeriPage raw GS v 0';
    readonly driverType = 'hardware' as const;

    readonly connectionRequirements = {
        services: [PERIPAGE_BLE_ENDPOINTS.service],
        namePrefixes: ['PeriPage', 'PPG'],
    };

    readonly supportedModels: PrinterModelProfile[] = PERIPAGE_MODELS;

    private transport?: IDeviceTransport;
    private activeProfile: PrinterModelProfile;
    private currentOptions?: UniversalPrintOptions;
    private jobActive = false;

    constructor(initialProfile?: PrinterModelProfile) {
        this.activeProfile = initialProfile ?? PERIPAGE_A6_PROFILE;
    }

    /**
     * Update the active profile manually or programmatically.
     * Rejects profiles outside PERIPAGE_MODELS.
     */
    setProfile(profile: PrinterModelProfile): void {
        const isKnown = PERIPAGE_MODELS.some(m => m.id === profile.id);
        if (!isKnown) {
            throw new Error(`Profile ${profile.id} (${profile.model}) is not supported by PeriPage raw GS v 0 driver.`);
        }
        this.activeProfile = profile;
    }

    /**
     * Get the active profile.
     */
    getProfile(): PrinterModelProfile {
        return this.activeProfile;
    }

    isCompatible(deviceName: string): boolean {
        return isPeriPageCompatible(deviceName);
    }

    async bindTransport(transport: IDeviceTransport): Promise<void> {
        this.transport = transport;
        const deviceName = transport.getDeviceName?.();
        if (deviceName) {
            const matched = matchPeriPageProfile(deviceName);
            if (matched) {
                this.activeProfile = matched;
            }
        }
        if (transport.startNotifications) {
            try {
                await transport.startNotifications({
                    serviceUUID: PERIPAGE_BLE_ENDPOINTS.service,
                    notifyUUID: PERIPAGE_BLE_ENDPOINTS.notify,
                });
            } catch {
                // Notifications are optional; ignore errors if transport does not support them
            }
        }
    }

    async unbindTransport(): Promise<void> {
        this.transport = undefined;
        this.jobActive = false;
        this.currentOptions = undefined;
    }

    getCapabilities(): PrinterCapabilities {
        return { ...this.activeProfile.capabilities, driverName: this.name };
    }

    /**
     * Initializes print job:
     * Sequence: enable (10 FF FE 01) → wake (12 x 00) → density (10 FF 10 00 n)
     */
    async printInit(options: UniversalPrintOptions): Promise<void> {
        this.currentOptions = options;
        await this.send(createEnableCommand());
        await this.send(createWakeCommand());
        const density = options.density ?? 2;
        await this.send(createDensityCommand(density));
        this.jobActive = true;
    }

    /**
     * Encodes and sends raster page:
     * Sequence: position (1D 0C) → one GS v 0 header → each raster row write
     *
     * Raster packing and framing remain local to the PeriPage family.
     */
    async printPage(page: UniversalPage): Promise<void> {
        if (!this.jobActive) {
            await this.printInit(this.currentOptions ?? { density: 2, copies: 1 });
        }

        const image = singlePlane(page);
        const printheadDots = this.getCapabilities().canvasHeightPx;
        const { data, widthBytes, rows } = encodePeriPageRaster(image, printheadDots);

        await this.send(createPositionCommand());
        await this.send(peripageRasterHeader(widthBytes, rows));

        for (let r = 0; r < rows; r++) {
            const rowBytes = data.subarray(r * widthBytes, (r + 1) * widthBytes);
            await this.send(rowBytes);
        }
    }

    /**
     * Finalizes print job:
     * Sequence: feed (1B 4A n) → stop (10 FF FE 45)
     */
    async printEnd(): Promise<void> {
        const dpmm = this.getCapabilities().dpmm;
        const feedDistance = this.currentOptions?.feedOverrides?.feedAfterMm !== undefined
            ? Math.round(this.currentOptions.feedOverrides.feedAfterMm * dpmm)
            : 0x48; // default feed distance (~9mm at 8 dpmm)

        await this.send(createFeedCommand(feedDistance));
        await this.send(createStopCommand());
        this.jobActive = false;
    }

    private async send(data: Uint8Array): Promise<void> {
        if (!this.transport) {
            throw new Error('Cannot send command: No transport bound to PeriPage driver.');
        }
        await this.transport.write(data, {
            serviceUUID: PERIPAGE_BLE_ENDPOINTS.service,
            writeUUID: PERIPAGE_BLE_ENDPOINTS.write,
            reliable: false,
        });
    }
}

export { PERIPAGE_MODELS } from './peripage-protocol';
