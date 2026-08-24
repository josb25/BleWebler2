import EventEmitter from "eventemitter3";
import type {
    BluetoothLEScanFilter,
    IDeviceTransport,
    TransportEventMap
} from "./transport.interface";

export interface NodeSerialTransportOptions {
    path?: string;
    baudRate?: number;
    deviceName?: string;
}

/** Serial transport for CLI applications, including RFCOMM and USB serial ports. */
export class NodeSerialTransport extends EventEmitter<TransportEventMap> implements IDeviceTransport {
    public readonly type = "Serial-Node";
    public readonly filterType = "none" as const;

    private port: import("serialport").SerialPort | null = null;
    private resolvedName: string;

    constructor(private readonly options: NodeSerialTransportOptions = {}) {
        super();
        this.resolvedName = options.deviceName ?? "NIIMBOT Serial Printer";
    }

    async connect(filters: BluetoothLEScanFilter[] = []): Promise<void> {
        const { SerialPort } = await import("serialport");
        const ports = await SerialPort.list();
        const prefixes = filters.flatMap(filter => filter.namePrefix ? [filter.namePrefix.toLowerCase()] : []);
        const selected = this.options.path
            ? ports.find(port => port.path === this.options.path)
            : ports.find(port => {
                const label = [port.manufacturer, port.pnpId, port.serialNumber, port.path]
                    .filter(Boolean).join(" ").toLowerCase();
                return prefixes.some(prefix => label.includes(prefix));
            }) ?? (ports.length === 1 ? ports[0] : undefined);

        if (!selected) {
            throw new Error("No unambiguous serial printer was found. Pass a serial port path explicitly.");
        }

        this.resolvedName = this.options.deviceName
            ?? selected.manufacturer
            ?? this.resolvedName;
        this.port = new SerialPort({
            path: selected.path,
            baudRate: this.options.baudRate ?? 115200,
            autoOpen: false
        });
        this.port.on("data", (data: Buffer) => this.emit("data", new Uint8Array(data)));
        this.port.on("close", () => this.emit("disconnected"));
        this.port.on("error", error => this.emit("error", error));
        await new Promise<void>((resolve, reject) => this.port!.open(error => error ? reject(error) : resolve()));
        this.emit("connected");
    }

    async disconnect(): Promise<void> {
        const port = this.port;
        this.port = null;
        if (!port?.isOpen) return;
        await new Promise<void>((resolve, reject) => port.close(error => error ? reject(error) : resolve()));
    }

    async write(data: Uint8Array): Promise<void> {
        if (!this.port?.isOpen) throw new Error("Serial transport is not connected.");
        await new Promise<void>((resolve, reject) => {
            this.port!.write(Buffer.from(data), error => {
                if (error) { reject(error); return; }
                this.port!.drain(drainError => drainError ? reject(drainError) : resolve());
            });
        });
    }

    isConnected(): boolean {
        return this.port?.isOpen === true;
    }

    getDeviceName(): string {
        return this.resolvedName;
    }

    async getPrimaryServices(): Promise<string[]> {
        return [];
    }
}
