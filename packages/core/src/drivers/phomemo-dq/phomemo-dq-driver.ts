import type { IDeviceTransport } from '../../core/transports/transport.interface';
import type { IPrinterDriver, PrinterCapabilities, PrinterModelProfile, UniversalPrintOptions } from '../driver.interface';
import { singlePlane, type UniversalPage } from '../../types/ink';
import * as Protocol from './protocol';
import { encodeRotatedRaster } from './raster';

const SERVICE = '0000ff00-0000-1000-8000-00805f9b34fb';
const WRITE = '0000ff02-0000-1000-8000-00805f9b34fb';
const NOTIFY = '0000ff03-0000-1000-8000-00805f9b34fb';

interface DqModel {
    model: string;
    headDots: number;
    media: number | { min: number; max: number };
}

const MODELS: readonly DqModel[] = [
    { model: 'D30', headDots: 96, media: { min: 6, max: 15 } },
    { model: 'D30S', headDots: 96, media: { min: 6, max: 15 } },
    { model: 'D35', headDots: 120, media: { min: 6, max: 15 } },
    { model: 'D50', headDots: 192, media: { min: 16, max: 24 } },
    { model: 'D110', headDots: 96, media: 12 },
    { model: 'Q30', headDots: 96, media: { min: 6, max: 15 } },
    { model: 'Q30S', headDots: 120, media: { min: 6, max: 15 } },
    { model: 'Q31', headDots: 96, media: { min: 6, max: 15 } },
    { model: 'Q32', headDots: 96, media: { min: 6, max: 15 } }
];

const profile = ({ model, headDots, media }: DqModel): PrinterModelProfile => ({
    id: `phomemo_${model.toLowerCase()}`,
    brand: 'Phomemo',
    model,
    family: 'D/Q rotated ESC/POS',
    supportLevel: 'Untested',
    capabilities: capabilities(headDots, media),
    notes: 'Experimental community support. Protocol-level tests pass; physical hardware validation is still requested.'
});

export const PHOMEMO_DQ_MODELS: PrinterModelProfile[] = MODELS.map(profile);

function capabilities(headDots: number, media: number | { min: number; max: number }): PrinterCapabilities {
    return {
        canvasHeightPx: headDots,
        dpmm: 8,
        maxDensity: 8,
        supportsSpeedMode: false,
        colorSupport: { type: 'monochrome' },
        physical: { supportedMediaWidthsMm: media },
        mediaDefaults: { feedAfterMinPx: 0, feedAfterMaxPx: 200, feedAfterDefaultPx: 0 }
    };
}

export class PhomemoDqDriver implements IPrinterDriver {
    readonly name = 'Phomemo D/Q (rotated ESC/POS)';
    readonly driverType = 'hardware' as const;
    readonly connectionRequirements = {
        services: [SERVICE],
        namePrefixes: MODELS.map(model => model.model)
    };
    readonly supportedModels = PHOMEMO_DQ_MODELS;

    private transport?: IDeviceTransport;
    private deviceName = '';

    isCompatible(deviceName: string): boolean {
        const upper = deviceName.trim().toUpperCase();
        return [...MODELS]
            .sort((a, b) => b.model.length - a.model.length)
            .some(({ model }) => upper === model || upper.startsWith(`${model}-`) || upper.startsWith(`${model}_`));
    }

    async bindTransport(transport: IDeviceTransport): Promise<void> {
        this.transport = transport;
        this.deviceName = transport.getDeviceName()?.toUpperCase() ?? '';
        if (transport.startNotifications) {
            try {
                await transport.startNotifications({ serviceUUID: SERVICE, notifyUUID: NOTIFY });
            } catch {
                // Notifications are informative on this family, not required to print.
            }
        }
    }

    async unbindTransport(): Promise<void> {
        this.transport = undefined;
        this.deviceName = '';
    }

    getCapabilities(): PrinterCapabilities {
        const model = this.matchModel();
        return { ...capabilities(model.headDots, model.media), driverName: this.name };
    }

    async printInit(options: UniversalPrintOptions): Promise<void> {
        await this.send(Protocol.heatSettings(options.density));
        await this.send(Protocol.mediaType(options.paper?.type === 'continuous'));
    }

    async printPage(page: UniversalPage): Promise<void> {
        const raster = encodeRotatedRaster(singlePlane(page), this.getCapabilities().canvasHeightPx);
        await this.send(Protocol.rasterHeader(raster.widthBytes, raster.rows));
        await this.sendChunked(raster.data);
    }

    async printEnd(): Promise<void> {
        await this.send(Protocol.endJob);
    }

    private matchModel(): DqModel {
        const ordered = [...MODELS].sort((a, b) => b.model.length - a.model.length);
        return ordered.find(({ model }) => this.deviceName === model
            || this.deviceName.startsWith(`${model}-`)
            || this.deviceName.startsWith(`${model}_`)) ?? MODELS[0];
    }

    private requireTransport(): IDeviceTransport {
        if (!this.transport) throw new Error('Phomemo D/Q transport is not bound.');
        return this.transport;
    }

    private async send(data: Uint8Array): Promise<void> {
        await this.requireTransport().write(data, { serviceUUID: SERVICE, writeUUID: WRITE, reliable: false });
        await new Promise(resolve => setTimeout(resolve, 30));
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
