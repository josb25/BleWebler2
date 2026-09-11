import type { IDeviceTransport } from '../../core/transports/transport.interface';
import type { IPrinterDriver, PrinterCapabilities, PrinterModelProfile, UniversalPrintOptions } from '../driver.interface';
import { singlePlane, type UniversalPage } from '../../types/ink';
import * as Protocol from './m-series-protocol';
import { encodeRotatedRaster } from './raster';

const SERVICE = '0000ff00-0000-1000-8000-00805f9b34fb';
const WRITE = '0000ff02-0000-1000-8000-00805f9b34fb';
const NOTIFY = '0000ff03-0000-1000-8000-00805f9b34fb';

interface MSeriesModel { model: string; headDots: number; mediaWidthMm: number; }
const MODELS: readonly MSeriesModel[] = [
    { model: 'M03', headDots: 432, mediaWidthMm: 53 },
    { model: 'T02', headDots: 384, mediaWidthMm: 48 },
    { model: 'M200', headDots: 608, mediaWidthMm: 75 },
    { model: 'M221', headDots: 576, mediaWidthMm: 72 },
    { model: 'M250', headDots: 576, mediaWidthMm: 75 },
    { model: 'M260', headDots: 576, mediaWidthMm: 72 }
];

function capabilities(model: MSeriesModel): PrinterCapabilities {
    return {
        canvasHeightPx: model.headDots,
        dpmm: 8,
        maxDensity: 8,
        supportsSpeedMode: false,
        colorSupport: { type: 'monochrome' },
        physical: { supportedMediaWidthsMm: model.mediaWidthMm },
        mediaDefaults: { feedAfterMinPx: 0, feedAfterMaxPx: 255, feedAfterDefaultPx: 32 }
    };
}

export const PHOMEMO_M_SERIES_MODELS: PrinterModelProfile[] = MODELS.map(model => ({
    id: `phomemo_${model.model.toLowerCase()}`,
    brand: 'Phomemo',
    model: model.model,
    family: 'General M-series ESC/POS-derived',
    supportLevel: 'Untested',
    capabilities: capabilities(model),
    notes: 'Experimental community support for the raw-raster M-series command sequence.'
}));

export class PhomemoMSeriesDriver implements IPrinterDriver {
    readonly name = 'Phomemo general M-series';
    readonly driverType = 'hardware' as const;
    readonly connectionRequirements = { services: [SERVICE], namePrefixes: MODELS.map(model => model.model) };
    readonly supportedModels = PHOMEMO_M_SERIES_MODELS;

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
                // The status channel is optional for printing.
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
        await this.send(Protocol.initialise, 100);
        await this.send(Protocol.heatSettings(options.density), 30);
        await this.send(Protocol.density(options.density), 50);
    }

    async printPage(page: UniversalPage): Promise<void> {
        const raster = encodeRotatedRaster(singlePlane(page), this.getCapabilities().canvasHeightPx);
        await this.send(Protocol.rasterHeader(raster.widthBytes, raster.rows), 0);
        await this.sendChunked(raster.data);
    }

    async printEnd(): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, 300));
        const overrideMm = this.options?.feedOverrides?.feedAfterMm;
        const dots = typeof overrideMm === 'number'
            ? overrideMm * this.getCapabilities().dpmm
            : 32;
        await this.send(Protocol.feed(dots), 800);
    }

    private matchModel(): MSeriesModel {
        return MODELS.find(({ model }) => this.deviceName === model
            || this.deviceName.startsWith(`${model}-`)
            || this.deviceName.startsWith(`${model}_`)) ?? MODELS[0];
    }

    private requireTransport(): IDeviceTransport {
        if (!this.transport) throw new Error('Phomemo M-series transport is not bound.');
        return this.transport;
    }

    private async send(data: Uint8Array, delayMs: number): Promise<void> {
        await this.requireTransport().write(data, { serviceUUID: SERVICE, writeUUID: WRITE, reliable: false });
        if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    private async sendChunked(data: Uint8Array): Promise<void> {
        const transport = this.requireTransport();
        for (let offset = 0; offset < data.length; offset += 128) {
            await transport.write(data.slice(offset, offset + 128), {
                serviceUUID: SERVICE,
                writeUUID: WRITE,
                reliable: false
            });
            if (offset + 128 < data.length) await new Promise(resolve => setTimeout(resolve, 20));
        }
    }
}

