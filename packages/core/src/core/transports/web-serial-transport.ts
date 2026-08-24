import EventEmitter from "eventemitter3";
import type {
    BluetoothLEScanFilter,
    IDeviceTransport,
    TransportEventMap
} from "./transport.interface";

interface SerialPortInfo {
    usbVendorId?: number;
    usbProductId?: number;
}

interface SerialPortLike {
    readable: ReadableStream<Uint8Array> | null;
    writable: WritableStream<Uint8Array> | null;
    open(options: { baudRate: number }): Promise<void>;
    close(): Promise<void>;
    getInfo(): SerialPortInfo;
}

interface SerialApi {
    requestPort(options?: { filters?: SerialPortInfo[] }): Promise<SerialPortLike>;
}

export interface WebSerialTransportOptions {
    baudRate?: number;
    deviceName?: string;
    usbVendorId?: number;
    usbProductId?: number;
    serial?: SerialApi;
}

/**
 * Byte transport for Web Serial devices. This covers USB serial adapters and
 * Bluetooth Classic devices that the operating system exposes as a serial port.
 */
export class WebSerialTransport extends EventEmitter<TransportEventMap> implements IDeviceTransport {
    public readonly type = "Serial-WebSerial";
    public readonly filterType = "none" as const;

    private port: SerialPortLike | null = null;
    private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
    private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    private reading = false;
    private readonly options: Required<Pick<WebSerialTransportOptions, "baudRate" | "deviceName">> & WebSerialTransportOptions;

    constructor(options: WebSerialTransportOptions = {}) {
        super();
        this.options = {
            baudRate: options.baudRate ?? 115200,
            deviceName: options.deviceName ?? "NIIMBOT Serial Printer",
            ...options
        };
    }

    async connect(_filters?: BluetoothLEScanFilter[]): Promise<void> {
        const serial = this.options.serial ?? (navigator as Navigator & { serial?: SerialApi }).serial;
        if (!serial) throw new Error("Web Serial is not supported in this environment.");

        const portFilters = this.options.usbVendorId === undefined
            ? undefined
            : [{
                usbVendorId: this.options.usbVendorId,
                ...(this.options.usbProductId === undefined ? {} : { usbProductId: this.options.usbProductId })
            }];

        this.port = await serial.requestPort(portFilters ? { filters: portFilters } : undefined);
        await this.port.open({ baudRate: this.options.baudRate });
        if (!this.port.writable) throw new Error("The selected serial port is not writable.");
        this.writer = this.port.writable.getWriter();
        this.emit("connected");
    }

    async disconnect(): Promise<void> {
        this.reading = false;
        try { await this.reader?.cancel(); } catch { /* already closed */ }
        this.reader?.releaseLock();
        this.reader = null;
        this.writer?.releaseLock();
        this.writer = null;
        await this.port?.close();
        this.port = null;
        this.emit("disconnected");
    }

    async write(data: Uint8Array): Promise<void> {
        if (!this.writer) throw new Error("Serial transport is not connected.");
        await this.writer.write(data);
    }

    async startNotifications(): Promise<void> {
        if (!this.port?.readable || this.reading) return;
        this.reading = true;
        this.reader = this.port.readable.getReader();
        void this.readLoop();
    }

    private async readLoop(): Promise<void> {
        try {
            while (this.reading && this.reader) {
                const { value, done } = await this.reader.read();
                if (done) break;
                if (value?.length) this.emit("data", value);
            }
        } catch (error) {
            if (this.reading) this.emit("error", error instanceof Error ? error : new Error(String(error)));
        }
    }

    isConnected(): boolean {
        return this.port !== null;
    }

    getDeviceName(): string {
        return this.options.deviceName;
    }

    async getPrimaryServices(): Promise<string[]> {
        return [];
    }
}
