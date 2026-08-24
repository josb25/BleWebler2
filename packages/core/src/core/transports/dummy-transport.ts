import EventEmitter from "eventemitter3";
import { IDeviceTransport, TransportEventMap, BluetoothLEScanFilter } from "./transport.interface";

/**
 * A fake transport layer that simulates a connection to a printer without native Bluetooth or Serial APIs.
 * It strictly outputs written data to the console for the DummyDriver to pick up, or vice versa.
 */
export class DummyTransport extends EventEmitter<TransportEventMap> implements IDeviceTransport {
    public readonly type = "Dummy";
    private connected = false;

    public async connect(filters?: BluetoothLEScanFilter[]): Promise<void> {
        console.log("[DummyTransport] Simulating connection to virtual printer...");

        // Simulate a small connection delay
        await new Promise(r => setTimeout(r, 500));

        this.connected = true;
        this.emit("connected");
        console.log("[DummyTransport] Connected and ready.");
    }

    public async disconnect(): Promise<void> {
        if (!this.connected) return;
        this.connected = false;
        this.emit("disconnected");
        console.log("[DummyTransport] Disconnected.");
    }

    public async write(data: Uint8Array, characteristicsInfo?: any): Promise<void> {
        if (!this.connected) throw new Error("DummyTransport is not connected.");
        // We do nothing here physically, we just pretend it was sent instantly
    }

    public async startNotifications?(characteristicsInfo?: any): Promise<void> {
        // Dummy drivers don't need flow control notifications usually, but we could mock it if needed
    }

    public isConnected(): boolean {
        return this.connected;
    }

    public getDeviceName(): string | undefined {
        return "Virtual-Dummy-Device";
    }
}
