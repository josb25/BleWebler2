import noble, {
    type Characteristic,
    type Peripheral,
    type Service
} from "@stoprocent/noble";
import EventEmitter from "eventemitter3";
import { IDeviceTransport, BluetoothLEScanFilter, TransportEventMap } from "./transport.interface";

/**
 * NodeBleTransport uses Noble's Node.js BLE API.
 */
export class NodeBleTransport extends EventEmitter<TransportEventMap> implements IDeviceTransport {
    public readonly type = "NodeBle";

    private device?: Peripheral;

    private notifyCharacteristics: Map<string, Characteristic> = new Map();
    private writeCharacteristics: Map<string, Characteristic> = new Map();
    private cachedServices: Map<string, Service> = new Map();

    private sanitizeUuid(uuid: string): string {
        return uuid.replace(/-/g, "").toLowerCase();
    }



    private async ensurePoweredOn(timeoutMs: number = 10000): Promise<void> {
        const nobleAny = noble as any;
        if (nobleAny.state === "poweredOn") return;

        return new Promise<void>((resolve, reject) => {
            let timer: NodeJS.Timeout | null = null;
            
            const onStateChange = (state: string) => {
                if (state === "poweredOn") {
                    if (timer) clearTimeout(timer);
                    noble.removeListener("stateChange", onStateChange);
                    resolve();
                }
            };
            
            noble.on("stateChange", onStateChange);
            
            if (timeoutMs > 0) {
                timer = setTimeout(() => {
                    noble.removeListener("stateChange", onStateChange);
                    reject(new Error(`Bluetooth did not power on within ${timeoutMs}ms.`));
                }, timeoutMs);
            }
        });
    }

    async scanDevices(timeoutMs: number = 10000, onDeviceFound?: (device: { id: string; name?: string }) => void): Promise<{ id: string; name?: string }[]> {
        await this.ensurePoweredOn(timeoutMs);

        return new Promise((resolve, reject) => {
            const devices = new Map<string, { id: string; name?: string }>();
            
            const onDiscover = (peripheral: Peripheral) => {
                if (!devices.has(peripheral.id)) {
                    const dev = {
                        id: peripheral.id,
                        name: peripheral.advertisement.localName
                    };
                    devices.set(peripheral.id, dev);
                    if (onDeviceFound) {
                        onDeviceFound(dev);
                    }
                }
            };

            noble.on("discover", onDiscover);
            
            noble.startScanningAsync([], true).catch(reject);

            setTimeout(() => {
                noble.removeListener("discover", onDiscover);
                noble.stopScanningAsync().catch(() => {});
                resolve(Array.from(devices.values()));
            }, timeoutMs);
        });
    }

    async connectByDeviceId(id: string, timeoutMs: number = 10000): Promise<void> {
        await this.ensurePoweredOn(timeoutMs);

        try {
            this.device = await new Promise<Peripheral>((resolve, reject) => {
                let timer: NodeJS.Timeout | null = null;

                const onDiscover = (peripheral: Peripheral) => {
                    if (peripheral.id === id) {
                        if (timer) clearTimeout(timer);
                        noble.removeListener("discover", onDiscover);
                        noble.stopScanningAsync().catch(() => { });
                        resolve(peripheral);
                    }
                };

                noble.on("discover", onDiscover);
                noble.startScanningAsync([], true).catch(reject);

                if (timeoutMs > 0) {
                    timer = setTimeout(() => {
                        noble.removeListener("discover", onDiscover);
                        noble.stopScanningAsync().catch(() => { });
                        reject(new Error(`Device ${id} not found within ${timeoutMs}ms.`));
                    }, timeoutMs);
                }
            });

            this.device.once("disconnect", this.onDisconnected);
            await this.device.connectAsync();
            this.emit("connected");
        } catch (error: any) {
            this.emit("error", error);
            throw error;
        }
    }

    async connect(filters: BluetoothLEScanFilter[] = [], timeoutMs: number = 10000): Promise<void> {
        await this.ensurePoweredOn(timeoutMs);

        try {
            this.device = await new Promise<Peripheral>((resolve, reject) => {
                let timer: NodeJS.Timeout | null = null;

                const onDiscover = (peripheral: Peripheral) => {
                    let matches = filters.length === 0;

                    if (!matches) {
                        for (const filter of filters) {
                            const nameMatches = !filter.namePrefix || (peripheral.advertisement.localName && peripheral.advertisement.localName.startsWith(filter.namePrefix));
                            const servicesMatch = !filter.services || filter.services.every(s => peripheral.advertisement.serviceUuids.includes(this.sanitizeUuid(s)));
                            const idMatches = !filter.id || peripheral.id === filter.id;

                            if (nameMatches && servicesMatch && idMatches) {
                                matches = true;
                                break;
                            }
                        }
                    }

                    if (matches) {
                        if (timer) clearTimeout(timer);
                        noble.removeListener("discover", onDiscover);
                        noble.stopScanningAsync().catch(() => { });
                        resolve(peripheral);
                    }
                };

                noble.on("discover", onDiscover);
                noble.startScanningAsync([], true).catch(reject);

                if (timeoutMs > 0) {
                    timer = setTimeout(() => {
                        noble.removeListener("discover", onDiscover);
                        noble.stopScanningAsync().catch(() => { });
                        reject(new Error(`No matching devices found within ${timeoutMs}ms.`));
                    }, timeoutMs);
                }
            });

            this.device.once("disconnect", this.onDisconnected);
            await this.device.connectAsync();
            this.emit("connected");
        } catch (error: any) {
            this.emit("error", error);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if (this.device && this.device.state === "connected") {
            await this.device.disconnectAsync();
        }
    }

    async getCharacteristic(serviceUUID: string, characteristicUUID: string): Promise<Characteristic> {
        if (!this.device) throw new Error("Not connected");

        const sUUID = this.sanitizeUuid(serviceUUID);
        const cUUID = this.sanitizeUuid(characteristicUUID);

        let service = this.cachedServices.get(sUUID);
        if (!service) {
            const services = await this.device.discoverServicesAsync([sUUID]);
            if (!services.length) throw new Error(`Service ${sUUID} not found`);
            service = services[0];
            this.cachedServices.set(sUUID, service);
        }

        const characteristics = await service.discoverCharacteristicsAsync([cUUID]);
        if (!characteristics.length) throw new Error(`Characteristic ${cUUID} not found in service ${sUUID}`);

        return characteristics[0];
    }

    async write(data: Uint8Array, characteristicsInfo?: { serviceUUID: string, writeUUID: string }): Promise<void> {
        if (!this.device || !characteristicsInfo) {
            throw new Error("Transport is not fully connected or characteristicsInfo is missing.");
        }

        let writeChar = this.writeCharacteristics.get(characteristicsInfo.writeUUID);

        if (!writeChar) {
            writeChar = await this.getCharacteristic(characteristicsInfo.serviceUUID, characteristicsInfo.writeUUID);
            this.writeCharacteristics.set(characteristicsInfo.writeUUID, writeChar);
        }

        await writeChar.writeAsync(Buffer.from(data), true);
    }

    async startNotifications(characteristicsInfo: { serviceUUID: string, notifyUUID: string }): Promise<void> {
        if (!this.device) {
            throw new Error("Not connected to device.");
        }

        let notifyChar = this.notifyCharacteristics.get(characteristicsInfo.notifyUUID);

        if (!notifyChar) {
            notifyChar = await this.getCharacteristic(characteristicsInfo.serviceUUID, characteristicsInfo.notifyUUID);
            this.notifyCharacteristics.set(characteristicsInfo.notifyUUID, notifyChar);
        }

        notifyChar.on("data", (data: Buffer) => {
            const array = new Uint8Array(data);
            this.emit("data", array, characteristicsInfo.notifyUUID);
        });

        await notifyChar.subscribeAsync();
    }

    private onDisconnected = () => {
        if (this.device) {
            this.device.removeListener("disconnect", this.onDisconnected);
            this.device = undefined;
        }
        this.writeCharacteristics.clear();
        this.notifyCharacteristics.clear();
        this.cachedServices.clear();
        this.emit("disconnected");
    };

    isConnected(): boolean {
        return !!(this.device && this.device.state === "connected");
    }

    getDeviceName(): string | undefined {
        return this.device?.advertisement.localName || this.device?.id;
    }

    async getPrimaryServices(): Promise<string[]> {
        if (!this.device) return [];
        try {
            const services = await this.device.discoverServicesAsync([]);
            return services.map(s => s.uuid);
        } catch (e) {
            console.error("Failed to get primary services:", e);
            return [];
        }
    }

    async getCharacteristics(serviceUUID: string): Promise<{ uuid: string, properties: any }[]> {
        if (!this.device) return [];
        try {
            const sUUID = this.sanitizeUuid(serviceUUID);
            const services = await this.device.discoverServicesAsync([sUUID]);
            if (!services.length) return [];

            const characteristics = await services[0].discoverCharacteristicsAsync([]);
            return characteristics.map(c => {
                const properties: readonly string[] = c.properties;
                return {
                    uuid: c.uuid,
                    properties: {
                        broadcast: properties.includes("broadcast"),
                        read: properties.includes("read"),
                        writeWithoutResponse: properties.includes("writeWithoutResponse"),
                        write: properties.includes("write"),
                        notify: properties.includes("notify"),
                        indicate: properties.includes("indicate"),
                        authenticatedSignedWrites: properties.includes("authenticatedSignedWrites"),
                        reliableWrite: properties.includes("reliableWrite"),
                        writableAuxiliaries: properties.includes("writableAuxiliaries")
                    }
                };
            });
        } catch (e) {
            console.error(`Failed to get characteristics for service ${serviceUUID}:`, e);
            return [];
        }
    }
}
