import EventEmitter from "eventemitter3";
import { IDeviceTransport, TransportEventMap } from "./transport.interface";

/**
 * WebUsbTransport utilizes the browser's native WebUSB API (`navigator.usb`).
 * It connects to a standard USB bulk interface (typically Class 7 for printers)
 * and pipes data to the Bulk In and Bulk Out endpoints.
 */
export class WebUsbTransport extends EventEmitter<TransportEventMap> implements IDeviceTransport {
    public readonly type: string = "USB-WebUSB";
    public readonly filterType = "usb" as const;
    private device: USBDevice | null = null;
    private writeEndpointNum: number | null = null;
    private readEndpointNum: number | null = null;
    private interfaceNum: number | null = null;
    private listening = false;

    constructor(private readonly autoConnect = true) {
        super();
    }

    protected async getUsbApi(): Promise<USB> {
        if (!navigator.usb) throw new Error("WebUSB API is not supported in this environment.");
        return navigator.usb;
    }

    public async connect(): Promise<void> {
        try {
            const usb = await this.getUsbApi();
            const isAutoConnect = this.autoConnect
                && typeof localStorage !== "undefined"
                && localStorage.getItem('autoConnectPrinter') === 'true';
            
            if (isAutoConnect) {
                const devices = await usb.getDevices();
                if (devices.length > 0) {
                    this.device = devices[0];
                    console.log(`[WebUSB] Auto-connecting to previously paired device: ${this.device.productName}`);
                }
            }
            
            if (!this.device) {
                this.device = await usb.requestDevice({ filters: [] });
            }
            
            await this.device.open();
            
            if (!this.device) {
                throw new Error("USB device is not connected.");
            }
            if (this.device.configuration === null) {
                await this.device.selectConfiguration(1);
            }

            const device = this.device;
            if (!device || !device.configuration) {
                throw new Error("USB device configuration is not available.");
            }

            // Find the first interface that has bulk endpoints
            let targetInterface: USBInterface | null = null;
            let epIn: USBEndpoint | null = null;
            let epOut: USBEndpoint | null = null;

            for (const iface of device.configuration.interfaces) {
                const alternate = iface.alternate;
                
                // Let's look for BULK IN and BULK OUT endpoints
                let inEp = alternate.endpoints.find(e => e.type === "bulk" && e.direction === "in");
                let outEp = alternate.endpoints.find(e => e.type === "bulk" && e.direction === "out");
                
                if (outEp) {
                    targetInterface = iface;
                    epOut = outEp;
                    epIn = inEp || null;
                    break;
                }
            }

            if (!targetInterface || !epOut) {
                throw new Error("Could not find a valid bulk out endpoint on the USB device.");
            }

            this.interfaceNum = targetInterface.interfaceNumber;
            this.writeEndpointNum = epOut.endpointNumber;
            if (epIn) {
                this.readEndpointNum = epIn.endpointNumber;
            }

            await this.device.claimInterface(this.interfaceNum);
            
            console.log(`[WebUSB] Connected to: ${this.device.productName} (Interface ${this.interfaceNum}, WriteEP: ${this.writeEndpointNum}, ReadEP: ${this.readEndpointNum})`);
            this.emit("connected");
        } catch (error: any) {
            console.error("[WebUSB] Connection failed", error);
            this.emit("error", error);
            throw error;
        }
    }

    public async disconnect(): Promise<void> {
        this.listening = false;
        if (this.device) {
            try {
                if (this.interfaceNum !== null) {
                    await this.device.releaseInterface(this.interfaceNum);
                }
                await this.device.close();
            } catch (e) {
                console.warn("[WebUSB] Error during disconnect", e);
            }
            this.handleDisconnect();
        }
    }

    public async write(data: Uint8Array, characteristicsInfo?: any): Promise<void> {
        if (!this.device || this.writeEndpointNum === null) {
            throw new Error("WebUSB Transport is not connected or missing write endpoint.");
        }
        
        try {
            await this.device.transferOut(this.writeEndpointNum, data as any);
        } catch (error: any) {
            console.error("[WebUSB] Write failed", error);
            this.emit("error", error);
            throw error;
        }
    }

    public async startNotifications(characteristicsInfo?: any): Promise<void> {
        if (!this.device || this.readEndpointNum === null) {
            console.warn("[WebUSB] startNotifications called but no bulk IN endpoint is available.");
            return;
        }

        if (this.listening) return;
        this.listening = true;

        this.pollRead();
    }

    private async pollRead() {
        if (!this.device || !this.listening || this.readEndpointNum === null) return;
        
        try {
            // Read 64 bytes at a time
            const result = await this.device.transferIn(this.readEndpointNum, 64);
            if (result.status === "ok" && result.data) {
                const array = new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength);
                this.emit("data", array);
            }
            
            if (this.listening) {
                // Keep polling
                this.pollRead();
            }
        } catch (e: any) {
            // If the error is not a halt or device disconnected, keep polling
            if (this.listening && e.name !== "NotFoundError") {
                setTimeout(() => this.pollRead(), 100);
            } else {
                this.listening = false;
                this.handleDisconnect();
            }
        }
    }

    public isConnected(): boolean {
        return !!(this.device && this.device.opened);
    }

    public getDeviceName(): string | undefined {
        return this.device?.productName || "Unknown USB Device";
    }

    public async getPrimaryServices(): Promise<string[]> {
        // USB doesn't have GATT services, we return an empty array
        return [];
    }

    private handleDisconnect() {
        this.device = null;
        this.writeEndpointNum = null;
        this.readEndpointNum = null;
        this.interfaceNum = null;
        this.emit("disconnected");
    }
}
