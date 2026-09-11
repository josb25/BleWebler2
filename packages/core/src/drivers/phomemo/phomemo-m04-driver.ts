import type { IDeviceTransport } from '../../core/transports/transport.interface';
import type { IPrinterDriver, PrinterCapabilities, PrinterModelProfile, UniversalPrintOptions } from '../driver.interface';
import { singlePlane, type UniversalPage } from '../../types/ink';
import * as Protocol from './m04-protocol';
import { encodeRotatedRaster } from './raster';

const SERVICE = '0000ff00-0000-1000-8000-00805f9b34fb';
const WRITE = '0000ff02-0000-1000-8000-00805f9b34fb';
const NOTIFY = '0000ff03-0000-1000-8000-00805f9b34fb';

interface M04Model { model: string; minMediaWidthMm: number; }
const MODELS: readonly M04Model[] = [
    { model: 'M04AS', minMediaWidthMm: 15 },
    { model: 'M04S', minMediaWidthMm: 53 }
];

/** Captured raw-raster widths for the three wide-media settings. */
const RASTER_WIDTHS = [
    { mediaWidthMm: 53, headDots: 600 },
    { mediaWidthMm: 80, headDots: 896 },
    { mediaWidthMm: 110, headDots: 1232 }
] as const;

function capabilities(model: M04Model): PrinterCapabilities {
    return {
        canvasHeightPx: 1232,
        dpmm: 12,
        maxDensity: 8,
        supportsSpeedMode: false,
        colorSupport: { type: 'monochrome' },
        physical: { supportedMediaWidthsMm: { min: model.minMediaWidthMm, max: 110 } },
        mediaDefaults: { feedAfterMinPx: 16, feedAfterMaxPx: 255, feedAfterDefaultPx: 32 }
    };
}

export const PHOMEMO_M04_MODELS: PrinterModelProfile[] = MODELS.map(model => ({
    id: `phomemo_${model.model.toLowerCase()}`,
    brand: 'Phomemo',
    model: model.model,
    family: 'M04 proprietary 300 dpi',
    supportLevel: 'Untested',
    capabilities: capabilities(model),
    notes: 'Experimental community support. The driver selects the captured 53, 80 or 110 mm raster profile from the print job paper.'
}));

export class PhomemoM04Driver implements IPrinterDriver {
    readonly name = 'Phomemo M04S/M04AS';
    readonly driverType = 'hardware' as const;
    readonly connectionRequirements = { services: [SERVICE], namePrefixes: MODELS.map(model => model.model) };
    readonly supportedModels = PHOMEMO_M04_MODELS;

    private transport?: IDeviceTransport;
    private deviceName = '';
    private options?: UniversalPrintOptions;

    isCompatible(deviceName: string): boolean {
        const upper = deviceName.trim().toUpperCase();
        return MODELS.some(({ model }) => upper === model
            || upper.startsWith(`${model}-`)
            || upper.startsWith(`${model}_`));
    }

    async bindTransport(transport: IDeviceTransport): Promise<void> {
        this.transport = transport;
        this.deviceName = transport.getDeviceName()?.toUpperCase() ?? '';
        if (transport.startNotifications) {
            try {
                await transport.startNotifications({ serviceUUID: SERVICE, notifyUUID: NOTIFY });
            } catch {
                // Printing does not depend on the optional status channel.
            }
        }
    }

    async unbindTransport(): Promise<void> {
        this.transport = undefined;
        this.deviceName = '';
        this.options = undefined;
    }

    getCapabilities(): PrinterCapabilities {
        return { ...capabilities(this.matchModel()), driverName: this.name };
    }

    async printInit(options: UniversalPrintOptions): Promise<void> {
        this.options = options;
        await this.send(Protocol.density(options.density), 30);
        await this.send(Protocol.heat(options.density), 30);
        await this.send(Protocol.initialiseContinuous, 30);
        await this.send(Protocol.rawCompression, 30);
    }

    async printPage(page: UniversalPage): Promise<void> {
        const targetDots = this.rasterHeadDots(this.options?.paper?.tapeWidthMm);
        const raster = encodeRotatedRaster(singlePlane(page), targetDots);
        await this.send(Protocol.rasterHeader(raster.widthBytes, raster.rows), 0);
        await this.sendChunked(raster.data);
    }

    async printEnd(): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, 300));
        const overrideMm = this.options?.feedOverrides?.feedAfterMm;
        const feedDots = typeof overrideMm === 'number' ? overrideMm * 12 : 32;
        const count = Math.max(1, Math.round(feedDots / 16));
        for (let index = 0; index < count; index += 1) {
            await this.send(Protocol.feed, 30);
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    private rasterHeadDots(mediaWidthMm?: number): number {
        const requested = typeof mediaWidthMm === 'number' && Number.isFinite(mediaWidthMm)
            ? mediaWidthMm
            : 110;
        return (RASTER_WIDTHS.find(profile => requested <= profile.mediaWidthMm)
            ?? RASTER_WIDTHS[RASTER_WIDTHS.length - 1]).headDots;
    }

    private matchModel(): M04Model {
        return MODELS.find(({ model }) => this.deviceName === model
            || this.deviceName.startsWith(`${model}-`)
            || this.deviceName.startsWith(`${model}_`)) ?? MODELS[0];
    }

    private requireTransport(): IDeviceTransport {
        if (!this.transport) throw new Error('Phomemo M04 transport is not bound.');
        return this.transport;
    }

    private async send(data: Uint8Array, delayMs: number): Promise<void> {
        await this.requireTransport().write(data, { serviceUUID: SERVICE, writeUUID: WRITE, reliable: false });
        if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    private async sendChunked(data: Uint8Array): Promise<void> {
        const transport = this.requireTransport();
        for (let offset = 0; offset < data.length; offset += 256) {
            await transport.write(data.slice(offset, offset + 256), {
                serviceUUID: SERVICE,
                writeUUID: WRITE,
                reliable: false
            });
            if (offset + 256 < data.length) await new Promise(resolve => setTimeout(resolve, 20));
        }
    }
}

