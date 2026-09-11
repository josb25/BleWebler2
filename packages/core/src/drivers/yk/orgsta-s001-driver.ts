import type { IDeviceTransport } from '../../core/transports/transport.interface';
import type { IPrinterDriver, PrinterCapabilities, PrinterModelProfile, UniversalPrintOptions } from '../driver.interface';
import { singlePlane, type UniversalPage } from '../../types/ink';
import * as Protocol from './astra-p1-protocol';

function capabilities(): PrinterCapabilities {
    return {
        canvasHeightPx: Protocol.PRINTABLE_DOTS,
        dpmm: 8,
        maxDensity: 5,
        supportsSpeedMode: false,
        colorSupport: { type: 'monochrome' },
        physical: { supportedMediaWidthsMm: 15 }
    };
}

export const ORGSTA_S001_MODELS: PrinterModelProfile[] = [{
    id: 'orgsta_s001',
    brand: 'Orgsta',
    model: 'S001',
    family: 'YK Astra P1 framed raster',
    supportLevel: 'Untested',
    capabilities: capabilities(),
    notes: 'Experimental 90-dot printable S001 profile over Bluetooth Classic/SPP or another raw serial transport.'
}];

export class OrgstaS001Driver implements IPrinterDriver {
    readonly name = 'Orgsta S001 (YK Astra P1)';
    readonly driverType = 'hardware' as const;
    readonly connectionRequirements = { services: [], namePrefixes: ['S001'] };
    readonly supportedModels = ORGSTA_S001_MODELS;

    private transport?: IDeviceTransport;
    private sequence = 0;
    private mediaMode: Protocol.S001MediaMode = 'tag';

    constructor(private readonly writeDelayMs = 20) {}

    isCompatible(deviceName: string): boolean {
        return deviceName.trim().toUpperCase() === 'S001';
    }

    async bindTransport(transport: IDeviceTransport): Promise<void> {
        if (transport.filterType === 'bluetooth-le') {
            throw new Error('Orgsta S001 currently requires Bluetooth Classic/SPP or a raw serial transport; its GATT endpoint is not verified.');
        }
        this.transport = transport;
    }

    async unbindTransport(): Promise<void> {
        this.transport = undefined;
        this.sequence = 0;
    }

    getCapabilities(): PrinterCapabilities {
        return { ...capabilities(), driverName: this.name };
    }

    async printInit(options: UniversalPrintOptions): Promise<void> {
        this.sequence = 0;
        this.mediaMode = mediaMode(options);
        await this.send(Protocol.Command.speed, Uint8Array.of(25));
        await this.send(Protocol.Command.density, Uint8Array.of(Protocol.densityLevel(options.density)));
        await this.send(Protocol.Command.paperType, Uint8Array.of(1, Protocol.paperType(this.mediaMode)));

        if (this.mediaMode === 'plain') {
            await this.send(Protocol.Command.feedBackward, Protocol.feedPayload(12));
        } else {
            await this.send(Protocol.Command.feedSpecial, Protocol.specialFeedPayload(2, 800));
            await this.send(Protocol.Command.feedForward, Protocol.feedPayload(2));
        }
    }

    async printPage(page: UniversalPage): Promise<void> {
        const raster = Protocol.encodeRaster(singlePlane(page));
        for (const slice of Protocol.rasterSlices(raster)) {
            await this.send(Protocol.Command.raster, slice);
        }
    }

    async printEnd(): Promise<void> {
        if (this.mediaMode === 'plain') {
            await this.send(Protocol.Command.feedForward, Protocol.feedPayload(52));
            await this.send(Protocol.Command.feedForward, Protocol.feedPayload(12));
        } else {
            await this.send(Protocol.Command.feedSpecial, Protocol.specialFeedPayload(1, 800));
        }
    }

    private async send(command: number, payload: Uint8Array): Promise<void> {
        const packet = Protocol.frame(command, payload, this.sequence);
        this.sequence = (this.sequence + 1) % 64;
        await this.requireTransport().write(packet);
        if (this.writeDelayMs > 0) await new Promise(resolve => setTimeout(resolve, this.writeDelayMs));
    }

    private requireTransport(): IDeviceTransport {
        if (!this.transport) throw new Error('Orgsta S001 transport is not bound.');
        return this.transport;
    }
}

function mediaMode(options: UniversalPrintOptions): Protocol.S001MediaMode {
    const type = options.paper?.type;
    if (type === 'continuous') return 'plain';
    if (type === 'black' || type === 'black-mark') return 'black-tag';
    return 'tag';
}
