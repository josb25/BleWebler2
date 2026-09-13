import type { IDeviceTransport } from '../../core/transports/transport.interface';
import type { IPrinterDriver, PrinterCapabilities, PrinterModelProfile, UniversalPrintOptions } from '../driver.interface';
import { singlePlane, type UniversalPage } from '../../types/ink';
import { encodeRotatedRaster } from './raster';
import * as Protocol from './tspl-protocol';

const HEAD_DOTS = 816;
const DPMM = 8;

const MODELS = ['PM-241', 'PM-241-BT'] as const;
const NAME_PATTERNS = ['PM-241', 'PM241', 'PM 241'] as const;

function capabilities(): PrinterCapabilities {
    return {
        canvasHeightPx: HEAD_DOTS,
        dpmm: DPMM,
        maxDensity: 8,
        supportsSpeedMode: true,
        colorSupport: { type: 'monochrome' },
        physical: { supportedMediaWidthsMm: 102 }
    };
}

export const PHOMEMO_TSPL_MODELS: PrinterModelProfile[] = MODELS.map(model => ({
    id: `phomemo_${model.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    brand: 'Phomemo',
    model,
    family: 'PM-241 TSPL',
    supportLevel: 'Untested',
    capabilities: capabilities(),
    notes: 'Experimental TSPL bitmap support over USB or Bluetooth Classic; not Web Bluetooth.'
}));

export class PhomemoTsplDriver implements IPrinterDriver {
    readonly name = 'Phomemo PM-241 (TSPL)';
    readonly driverType = 'hardware' as const;
    readonly connectionRequirements = { services: [], namePrefixes: [...NAME_PATTERNS] };
    readonly supportedModels = PHOMEMO_TSPL_MODELS;

    private transport?: IDeviceTransport;
    private options?: UniversalPrintOptions;

    isCompatible(deviceName: string): boolean {
        const upper = deviceName.trim().toUpperCase();
        return NAME_PATTERNS.some(name => upper === name
            || upper.startsWith(`${name}-`)
            || upper.startsWith(`${name}_`));
    }

    async bindTransport(transport: IDeviceTransport): Promise<void> {
        this.transport = transport;
    }

    async unbindTransport(): Promise<void> {
        this.transport = undefined;
        this.options = undefined;
    }

    getCapabilities(): PrinterCapabilities {
        return { ...capabilities(), driverName: this.name };
    }

    async printInit(options: UniversalPrintOptions): Promise<void> {
        this.options = options;
    }

    async printPage(page: UniversalPage): Promise<void> {
        const options = this.options;
        const paper = options?.paper;
        const raster = encodeRotatedRaster(singlePlane(page), HEAD_DOTS);
        const widthMm = paper?.tapeWidthMm ?? raster.widthBytes * 8 / DPMM;
        const heightMm = paper?.labelLengthMm ?? raster.rows / DPMM;
        const density = Math.round(((Math.max(1, Math.min(8, options?.density ?? 4))) / 8) * 15);
        const speed = options?.speed ?? 4;
        const gapMm = paper?.type === 'continuous' ? 0 : (paper?.gapMm ?? 3);

        await this.send(Protocol.size(widthMm, heightMm));
        await this.send(Protocol.gap(gapMm));
        await this.send(Protocol.offset(-3));
        await this.send(Protocol.density(density));
        await this.send(Protocol.speed(speed));
        await this.send(Protocol.directionNormal);
        await this.send(Protocol.clear);
        await this.send(Protocol.bitmapHeader(raster.widthBytes, raster.rows));
        await this.sendChunked(Protocol.invertRaster(raster.data));
        await this.send(Protocol.rasterTerminator);
    }

    async printEnd(): Promise<void> {
        // PrintManager already expands copies into one job per call.
        await this.send(Protocol.print(1));
    }

    private requireTransport(): IDeviceTransport {
        if (!this.transport) throw new Error('Phomemo TSPL transport is not bound.');
        return this.transport;
    }

    private async send(data: Uint8Array): Promise<void> {
        await this.requireTransport().write(data);
    }

    private async sendChunked(data: Uint8Array): Promise<void> {
        const transport = this.requireTransport();
        for (let offset = 0; offset < data.length; offset += 512) {
            await transport.write(data.slice(offset, offset + 512));
            if (offset + 512 < data.length) await new Promise(resolve => setTimeout(resolve, 10));
        }
    }
}

