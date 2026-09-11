import type { IDeviceTransport } from '../../core/transports/transport.interface';
import type { IPrinterDriver, PrinterCapabilities, PrinterModelProfile, UniversalPrintOptions } from '../driver.interface';
import { singlePlane, type UniversalPage } from '../../types/ink';
import { rotateToPrintRows } from './raster';
import * as Protocol from './funny-lx-protocol';

const SERVICE = '0000ffe6-0000-1000-8000-00805f9b34fb';
const WRITE = '0000ffe1-0000-1000-8000-00805f9b34fb';
const NOTIFY = '0000ffe2-0000-1000-8000-00805f9b34fb';
const MODELS = [
    'LX-D01', 'LX-D02', 'LX-D2', 'LX-D3', 'LX-D4', 'LX-D5', 'LX-D6', 'LX-D7',
    'LX-D8', 'LX-D9', 'LX-D03', 'LX-D04', 'LX-D05', 'LX-D06', 'LX-D07',
    'LX-D08', 'LX-D09', 'BH-01'
] as const;

interface NotificationWaiter {
    predicate: (data: Uint8Array) => boolean;
    resolve: (data: Uint8Array) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
}

function capabilities(): PrinterCapabilities {
    return {
        canvasHeightPx: Protocol.PRINTHEAD_DOTS,
        dpmm: 8,
        maxDensity: 5,
        supportsSpeedMode: false,
        colorSupport: { type: 'monochrome' },
        physical: { supportedMediaWidthsMm: 58 }
    };
}

export const FUNNY_LX_MODELS: PrinterModelProfile[] = [{
    id: 'catprinter_funny_lx_d',
    brand: 'Generic Cat Printer',
    model: 'LX-D / BH-01',
    family: 'Funny Print LX direct raster',
    supportLevel: 'Untested',
    capabilities: capabilities(),
    notes: 'Experimental support for LX-D01 through LX-D09 units marketed as BH-01. Authentication requires the MAC bytes returned by the printer status response.'
}];

export class FunnyLxDriver implements IPrinterDriver {
    readonly name = 'Funny Print (LX-D / BH-01 direct raster)';
    readonly driverType = 'hardware' as const;
    readonly connectionRequirements = { services: [SERVICE], namePrefixes: [...MODELS] };
    readonly supportedModels = FUNNY_LX_MODELS;

    private transport?: IDeviceTransport;
    private notifications: Uint8Array[] = [];
    private waiters: NotificationWaiter[] = [];
    private supportsDarkness = false;
    private packetDelayMs = 20;
    private pendingPacketCount?: number;

    constructor(private readonly randomFactory: () => Uint8Array = secureRandomChallenge) {}

    isCompatible(deviceName: string): boolean {
        const upper = deviceName.trim().toUpperCase();
        return MODELS.some(model => upper === model);
    }

    async bindTransport(transport: IDeviceTransport): Promise<void> {
        this.transport = transport;
        transport.on('data', this.handleData);
        if (!transport.startNotifications) {
            throw new Error('Funny LX authentication requires BLE notifications.');
        }
        await transport.startNotifications({ serviceUUID: SERVICE, notifyUUID: NOTIFY });
        await this.authenticate();
    }

    async unbindTransport(): Promise<void> {
        this.transport?.off('data', this.handleData);
        this.transport = undefined;
        this.notifications = [];
        this.pendingPacketCount = undefined;
        for (const waiter of this.waiters.splice(0)) {
            clearTimeout(waiter.timeout);
            waiter.reject(new Error('Funny LX transport was unbound.'));
        }
    }

    getCapabilities(): PrinterCapabilities {
        return { ...capabilities(), driverName: this.name };
    }

    async printInit(options: UniversalPrintOptions): Promise<void> {
        this.requireTransport();
        if (this.supportsDarkness) await this.write(Protocol.darkness(options.density || 4));
    }

    async printPage(page: UniversalPage): Promise<void> {
        const rows = rotateToPrintRows(singlePlane(page), Protocol.PRINTHEAD_DOTS);
        const packets = Protocol.buildImagePackets(rows);
        this.pendingPacketCount = packets.length;
        await this.write(Protocol.printHeader(packets.length));
        await this.sendImagePackets(packets);
    }

    async printEnd(): Promise<void> {
        const packetCount = this.pendingPacketCount;
        if (packetCount === undefined) throw new Error('Funny LX has no pending raster to finish.');
        const footer = Protocol.printFooter(packetCount);
        await this.write(footer);
        try {
            await this.waitForNotification(data => Protocol.footerMatches(data, packetCount), 10_000);
        } catch (error) {
            // The reference flow treats the footer echo as optional; some firmware is silent here.
            if (!(error instanceof Error) || !error.message.includes('Timed out')) throw error;
        }
        this.pendingPacketCount = undefined;
    }

    private async authenticate(): Promise<void> {
        await this.write(Protocol.statusQuery);
        const status = await this.waitForNotification(data => Protocol.hasPrefix(data, [0x5a, 0x01]), 5_000);
        if (status.length < 10) {
            throw new Error('Funny LX status did not include the MAC bytes required for authentication.');
        }
        this.supportsDarkness = status.length >= 4 && status[2] === 0 && status[3] === 3;
        const mac = status.slice(4, 10);
        const random = this.randomFactory();
        const crc = Protocol.challengeCrc(random, mac);

        await this.write(Protocol.randomChallenge(random));
        await this.waitForNotification(
            data => Protocol.hasPrefix(data, [0x5a, 0x0a])
                && crc.low.every((byte, index) => data[index + 2] === byte),
            5_000
        );
        await this.write(Protocol.highChallenge(crc.high));
        await this.waitForNotification(data => Protocol.hasPrefix(data, [0x5a, 0x0b, 0x01]), 5_000);
    }

    private async sendImagePackets(packets: readonly Uint8Array[]): Promise<void> {
        let index = 0;
        let retries = 0;
        while (true) {
            while (index < packets.length) {
                const queuedRetry = this.takeRetryIndex();
                if (queuedRetry !== undefined) {
                    if (retries++ >= 10) throw new Error('Funny LX exceeded the image-packet retry limit.');
                    index = Math.max(0, Math.min(queuedRetry - 1, packets.length - 1));
                    continue;
                }
                if (this.packetDelayMs > 0) await new Promise(resolve => setTimeout(resolve, this.packetDelayMs));
                await this.write(packets[index]);
                index += 1;
            }

            const response = await this.waitForNotification(data =>
                Protocol.hasPrefix(data, [0x5a, 0x06])
                || Protocol.hasPrefix(data, [0x5a, 0x08])
                || Protocol.retryIndex(data) !== undefined,
            10_000);
            const requested = Protocol.retryIndex(response);
            if (requested !== undefined) {
                if (retries++ >= 10) throw new Error('Funny LX exceeded the image-packet retry limit.');
                index = Math.max(0, Math.min(requested - 1, packets.length - 1));
                continue;
            }
            if (Protocol.hasPrefix(response, [0x5a, 0x06])) return;
        }
    }

    private takeRetryIndex(): number | undefined {
        const index = this.notifications.findIndex(data => Protocol.retryIndex(data) !== undefined);
        if (index < 0) return undefined;
        return Protocol.retryIndex(this.notifications.splice(index, 1)[0]);
    }

    private requireTransport(): IDeviceTransport {
        if (!this.transport) throw new Error('Funny LX transport is not bound.');
        return this.transport;
    }

    private write(data: Uint8Array): Promise<void> {
        return this.requireTransport().write(data, {
            serviceUUID: SERVICE,
            writeUUID: WRITE,
            reliable: false
        });
    }

    private handleData = (data: Uint8Array): void => {
        const delay = Protocol.delayHintMs(data);
        if (delay !== undefined) {
            this.packetDelayMs = Math.min(500, delay);
            return;
        }
        const waiterIndex = this.waiters.findIndex(waiter => waiter.predicate(data));
        if (waiterIndex >= 0) {
            const [waiter] = this.waiters.splice(waiterIndex, 1);
            clearTimeout(waiter.timeout);
            waiter.resolve(data);
            return;
        }
        this.notifications.push(data);
    };

    private waitForNotification(predicate: (data: Uint8Array) => boolean, timeoutMs: number): Promise<Uint8Array> {
        const queuedIndex = this.notifications.findIndex(predicate);
        if (queuedIndex >= 0) return Promise.resolve(this.notifications.splice(queuedIndex, 1)[0]);

        return new Promise((resolve, reject) => {
            const waiter: NotificationWaiter = {
                predicate,
                resolve,
                reject,
                timeout: setTimeout(() => {
                    const index = this.waiters.indexOf(waiter);
                    if (index >= 0) this.waiters.splice(index, 1);
                    reject(new Error('Timed out waiting for a Funny LX protocol response.'));
                }, timeoutMs)
            };
            this.waiters.push(waiter);
        });
    }
}

function secureRandomChallenge(): Uint8Array {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(10));
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = (bytes[index] % 254) + 1;
    return bytes;
}
