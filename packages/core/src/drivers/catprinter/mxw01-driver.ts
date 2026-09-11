import type { IDeviceTransport } from '../../core/transports/transport.interface';
import type { IPrinterDriver, PrinterCapabilities, PrinterModelProfile, UniversalPrintOptions } from '../driver.interface';
import { singlePlane, type UniversalPage } from '../../types/ink';
import { rotateToPrintRows } from './raster';
import * as Protocol from './mxw01-protocol';

const SERVICE = '0000ae30-0000-1000-8000-00805f9b34fb';
const SERVICE_ALT = '0000af30-0000-1000-8000-00805f9b34fb';

const MODELS = [
    'MXW01', 'MXW01-1', 'V5X', 'X1', 'X2', 'C17', 'MXW-W5', 'AC695X_PRINT',
    'JK01', 'PORTABLEPRINTER', 'INSTANTPRINTPLUS', 'REKA', 'HDMDT-00', 'KERUI', 'BH03'
] as const;

function capabilities(): PrinterCapabilities {
    return {
        canvasHeightPx: Protocol.PRINTHEAD_DOTS,
        dpmm: 8,
        maxDensity: 8,
        supportsSpeedMode: false,
        colorSupport: { type: 'monochrome' },
        physical: { supportedMediaWidthsMm: 58 }
    };
}

export const CATPRINTER_MXW01_MODELS: PrinterModelProfile[] = MODELS.map(model => ({
    id: `catprinter_v5x_${model.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    brand: 'Generic Cat Printer',
    model,
    family: 'V5X/MXW01 bulk raster',
    supportLevel: 'Untested',
    capabilities: capabilities(),
    notes: 'Experimental community support for the 22 21 control and AE03 bulk-raster protocol.'
}));

export class CatPrinterMxw01Driver implements IPrinterDriver {
    readonly name = 'Catprinter (V5X/MXW01 bulk raster)';
    readonly driverType = 'hardware' as const;
    readonly connectionRequirements = { services: [SERVICE, SERVICE_ALT], namePrefixes: [...MODELS] };
    readonly supportedModels = CATPRINTER_MXW01_MODELS;

    private transport?: IDeviceTransport;
    private serviceUUID = SERVICE;
    private notificationsReady = false;
    private responses = new Map<number, Uint8Array[]>();
    private waiters = new Map<number, Array<(payload: Uint8Array) => void>>();

    isCompatible(deviceName: string): boolean {
        const upper = deviceName.trim().toUpperCase();
        return MODELS.some(model => upper === model
            || upper.startsWith(`${model}-`)
            || upper.startsWith(`${model}_`));
    }

    async bindTransport(transport: IDeviceTransport): Promise<void> {
        this.transport = transport;
        transport.on('data', this.handleData);
        if (transport.startNotifications) {
            for (const serviceUUID of [SERVICE, SERVICE_ALT]) {
                try {
                    await transport.startNotifications({ serviceUUID, notifyUUID: Protocol.NOTIFY });
                    this.serviceUUID = serviceUUID;
                    this.notificationsReady = true;
                    break;
                } catch {
                    // Some Apple stacks expose AF30 for the otherwise identical service.
                }
            }
        }
    }

    async unbindTransport(): Promise<void> {
        this.transport?.off('data', this.handleData);
        this.transport = undefined;
        this.serviceUUID = SERVICE;
        this.notificationsReady = false;
        this.responses.clear();
        this.waiters.clear();
    }

    getCapabilities(): PrinterCapabilities {
        return { ...capabilities(), driverName: this.name };
    }

    async printInit(options: UniversalPrintOptions): Promise<void> {
        const density = Math.max(1, Math.min(8, Math.round(options.density || 4)));
        const intensity = Math.round(40 + ((density - 1) / 7) * 120);
        await this.writeControl(Protocol.setIntensity(intensity));
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    async printPage(page: UniversalPage): Promise<void> {
        const data = Protocol.prepareRaster(rotateToPrintRows(singlePlane(page), Protocol.PRINTHEAD_DOTS));
        const rowCount = data.length / Protocol.ROW_BYTES;

        this.responses.delete(0xa9);
        await this.writeControl(Protocol.printRequest(rowCount));
        if (this.notificationsReady) {
            const acknowledgement = await this.waitForResponse(0xa9, 3000);
            if (acknowledgement[0] !== 0) throw new Error('MXW01 rejected the print request.');
        } else {
            // A small number of transports cannot expose notifications; retain a best-effort path.
            await new Promise(resolve => setTimeout(resolve, 150));
        }

        for (let offset = 0; offset < data.length; offset += Protocol.ROW_BYTES) {
            await this.writeData(data.slice(offset, offset + Protocol.ROW_BYTES));
            if (offset + Protocol.ROW_BYTES < data.length) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
    }

    async printEnd(): Promise<void> {
        await this.writeControl(Protocol.flush);
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    private requireTransport(): IDeviceTransport {
        if (!this.transport) throw new Error('Catprinter MXW01 transport is not bound.');
        return this.transport;
    }

    private writeControl(data: Uint8Array): Promise<void> {
        return this.requireTransport().write(data, {
            serviceUUID: this.serviceUUID,
            writeUUID: Protocol.CONTROL_WRITE,
            reliable: false
        });
    }

    private writeData(data: Uint8Array): Promise<void> {
        return this.requireTransport().write(data, {
            serviceUUID: this.serviceUUID,
            writeUUID: Protocol.DATA_WRITE,
            reliable: false
        });
    }

    private handleData = (data: Uint8Array): void => {
        const response = Protocol.parseNotification(data);
        if (!response) return;
        const waiter = this.waiters.get(response.opcode)?.shift();
        if (waiter) {
            waiter(response.payload);
            return;
        }
        const queued = this.responses.get(response.opcode) ?? [];
        queued.push(response.payload);
        this.responses.set(response.opcode, queued);
    };

    private waitForResponse(opcode: number, timeoutMs: number): Promise<Uint8Array> {
        const queued = this.responses.get(opcode)?.shift();
        if (queued) return Promise.resolve(queued);

        return new Promise((resolve, reject) => {
            const done = (payload: Uint8Array) => {
                clearTimeout(timeout);
                resolve(payload);
            };
            const timeout = setTimeout(() => {
                const waiters = this.waiters.get(opcode);
                const index = waiters?.indexOf(done) ?? -1;
                if (index >= 0) waiters?.splice(index, 1);
                reject(new Error(`Timed out waiting for MXW01 response 0x${opcode.toString(16)}.`));
            }, timeoutMs);
            const waiters = this.waiters.get(opcode) ?? [];
            waiters.push(done);
            this.waiters.set(opcode, waiters);
        });
    }
}

