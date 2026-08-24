import EventEmitter from 'eventemitter3';
import type { PluginListenerHandle } from '@capacitor/core';
import type { BluetoothLEScanFilter, IDeviceTransport, TransportEventMap } from './transport.interface';

interface UsbDevice {
    deviceId: string;
    vendorId: number;
    productId: number;
    deviceName: string;
    hasPermission: boolean;
}

interface CapacitorUsbApi {
    listDevices(): Promise<{ devices: UsbDevice[] }>;
    requestPermission(options: { deviceId: string }): Promise<{ granted: boolean }>;
    open(options: { deviceId: string; portNum?: number }): Promise<{ portId: string }>;
    close(options: { portId: string }): Promise<void>;
    setParameters(options: { portId: string; baudRate: number; dataBits: 8; stopBits: 1; parity: 'none' }): Promise<void>;
    write(options: { portId: string; data: string }): Promise<{ bytesWritten: number }>;
    startReading(options: { portId: string }): Promise<void>;
    stopReading(options: { portId: string }): Promise<void>;
    addListener(eventName: 'data', listener: (event: { portId: string; data: string }) => void): Promise<PluginListenerHandle>;
    addListener(eventName: 'error', listener: (event: { portId: string; message: string }) => void): Promise<PluginListenerHandle>;
    addListener(eventName: 'detached', listener: (event: { deviceId: string }) => void): Promise<PluginListenerHandle>;
}

export interface CapacitorUsbTransportOptions {
    deviceId?: string;
    vendorId?: number;
    productId?: number;
    portNum?: number;
    baudRate?: number;
}

function encodeBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
    const binary = atob(value);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
}

/** Binary-safe USB serial transport for the Capacitor Android shell. */
export class CapacitorUsbTransport extends EventEmitter<TransportEventMap> implements IDeviceTransport {
    readonly type = 'USB-Capacitor';
    readonly filterType = 'usb' as const;

    private api?: CapacitorUsbApi;
    private portId?: string;
    private device?: UsbDevice;
    private pluginListeners: PluginListenerHandle[] = [];

    constructor(private readonly options: CapacitorUsbTransportOptions = {}, api?: CapacitorUsbApi) {
        super();
        this.api = api;
    }

    private async getApi(): Promise<CapacitorUsbApi> {
        if (this.api) return this.api;
        const { UsbSerial } = await import('@leeskies/capacitor-usb-serial');
        this.api = UsbSerial;
        return this.api;
    }

    async connect(_filters: BluetoothLEScanFilter[] = []): Promise<void> {
        const api = await this.getApi();
        const { devices } = await api.listDevices();
        const matches = devices.filter(device =>
            (!this.options.deviceId || device.deviceId === this.options.deviceId)
            && (this.options.vendorId === undefined || device.vendorId === this.options.vendorId)
            && (this.options.productId === undefined || device.productId === this.options.productId)
        );
        if (matches.length !== 1) {
            throw new Error(matches.length === 0
                ? 'No matching USB serial printer is attached.'
                : 'More than one USB serial device is attached; select one by device or vendor/product id.');
        }

        const device = matches[0];
        if (!device.hasPermission) {
            const permission = await api.requestPermission({ deviceId: device.deviceId });
            if (!permission.granted) throw new Error('USB permission was not granted.');
        }

        const { portId } = await api.open({ deviceId: device.deviceId, portNum: this.options.portNum ?? 0 });
        this.device = device;
        this.portId = portId;
        await api.setParameters({ portId, baudRate: this.options.baudRate ?? 115200, dataBits: 8, stopBits: 1, parity: 'none' });
        this.pluginListeners = [
            await api.addListener('data', event => {
                if (event.portId === this.portId) this.emit('data', decodeBase64(event.data));
            }),
            await api.addListener('error', event => {
                if (event.portId === this.portId) this.emit('error', new Error(event.message));
            }),
            await api.addListener('detached', event => {
                if (event.deviceId === this.device?.deviceId) this.emit('disconnected');
            })
        ];
        await api.startReading({ portId });
        this.emit('connected');
    }

    async disconnect(): Promise<void> {
        const api = await this.getApi();
        const portId = this.portId;
        this.portId = undefined;
        this.device = undefined;
        for (const listener of this.pluginListeners.splice(0)) await listener.remove();
        if (!portId) return;
        await api.stopReading({ portId }).catch(() => undefined);
        await api.close({ portId }).catch(() => undefined);
        this.emit('disconnected');
    }

    async write(data: Uint8Array): Promise<void> {
        if (!this.portId) throw new Error('USB serial transport is not connected.');
        const result = await (await this.getApi()).write({ portId: this.portId, data: encodeBase64(data) });
        if (result.bytesWritten !== data.length) throw new Error('USB serial write was incomplete.');
    }

    isConnected(): boolean { return this.portId !== undefined; }
    getDeviceName(): string | undefined { return this.device?.deviceName; }
    async getPrimaryServices(): Promise<string[]> { return []; }
}
