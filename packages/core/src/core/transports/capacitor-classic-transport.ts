import EventEmitter from 'eventemitter3';
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { BluetoothLEScanFilter, IDeviceTransport, TransportEventMap } from './transport.interface';

interface ClassicDevice { name: string; address: string; }
interface ClassicPlugin {
    requestPermissions(): Promise<void>;
    listDevices(): Promise<{ devices: ClassicDevice[] }>;
    connect(options: { address: string; insecure?: boolean }): Promise<void>;
    disconnect(): Promise<void>;
    write(options: { data: string }): Promise<void>;
    addListener(eventName: 'data', listener: (event: { data: string }) => void): Promise<PluginListenerHandle>;
    addListener(eventName: 'disconnected', listener: () => void): Promise<PluginListenerHandle>;
    addListener(eventName: 'error', listener: (event: { message: string }) => void): Promise<PluginListenerHandle>;
}

export interface CapacitorClassicTransportOptions { address?: string; insecure?: boolean; }

const nativeClassic = registerPlugin<ClassicPlugin>('BleWeblerClassic');

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

/** Binary-safe RFCOMM/SPP transport for paired printers on Capacitor Android. */
export class CapacitorClassicTransport extends EventEmitter<TransportEventMap> implements IDeviceTransport {
    readonly type = 'BluetoothClassic-Capacitor';
    readonly filterType = 'none' as const;
    private device?: ClassicDevice;
    private connected = false;
    private pluginListeners: PluginListenerHandle[] = [];

    constructor(private readonly options: CapacitorClassicTransportOptions = {}, private readonly api: ClassicPlugin = nativeClassic) {
        super();
    }

    async connect(filters: BluetoothLEScanFilter[] = []): Promise<void> {
        await this.api.requestPermissions();
        const { devices } = await this.api.listDevices();
        const prefixes = filters.flatMap(filter => filter.namePrefix ? [filter.namePrefix.toLowerCase()] : []);
        const matches = devices.filter(device =>
            (!this.options.address || device.address === this.options.address)
            && (prefixes.length === 0 || prefixes.some(prefix => device.name.toLowerCase().startsWith(prefix)))
        );
        if (matches.length !== 1) {
            throw new Error(matches.length === 0
                ? 'No paired Bluetooth Classic printer matches the supported drivers.'
                : 'More than one paired Bluetooth Classic printer matches; pass its address explicitly.');
        }

        this.device = matches[0];
        this.pluginListeners = [
            await this.api.addListener('data', event => this.emit('data', decodeBase64(event.data))),
            await this.api.addListener('disconnected', () => { this.connected = false; this.emit('disconnected'); }),
            await this.api.addListener('error', event => this.emit('error', new Error(event.message)))
        ];
        await this.api.connect({ address: this.device.address, insecure: this.options.insecure });
        this.connected = true;
        this.emit('connected');
    }

    async disconnect(): Promise<void> {
        const wasConnected = this.connected;
        this.connected = false;
        this.device = undefined;
        await this.api.disconnect().catch(() => undefined);
        for (const listener of this.pluginListeners.splice(0)) await listener.remove();
        if (wasConnected) this.emit('disconnected');
    }

    async write(data: Uint8Array): Promise<void> {
        if (!this.connected) throw new Error('Bluetooth Classic transport is not connected.');
        await this.api.write({ data: encodeBase64(data) });
    }

    isConnected(): boolean { return this.connected; }
    getDeviceName(): string | undefined { return this.device?.name; }
    async getPrimaryServices(): Promise<string[]> { return []; }
}
