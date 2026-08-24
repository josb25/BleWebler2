import EventEmitter from "eventemitter3";

export interface TransportEventMap {
    connected: () => void;
    disconnected: () => void;
    data: (data: Uint8Array, characteristicId?: string) => void;
    error: (error: Error) => void;
}

export interface BluetoothLEScanFilter {
    namePrefix?: string;
    services?: string[]; // UUIDs
    id?: string; // Peripheral ID/MAC
}

/**
 * IDeviceTransport abstracts the physical connection to the printer device.
 * It is completely unaware of printer protocols or commands.
 */
export interface IDeviceTransport extends EventEmitter<TransportEventMap> {
    /**
     * Identifies the type of transport (e.g., "Bluetooth", "Serial", "USB")
     */
    readonly type: string;

    /** Discovery filter family accepted by this transport. */
    readonly filterType?: 'bluetooth-le' | 'usb' | 'none';

    /**
     * Connects to a device using the specified filters.
     * Prompts the user or automatically resolves depending on the environment.
     */
    connect(filters?: BluetoothLEScanFilter[]): Promise<void>;

    /**
     * Disconnects from the current device.
     */
    disconnect(): Promise<void>;

    /**
     * Writes raw bytes to the appropriate characteristic/endpoint.
     * 
     * @param data The raw data buffer to transmit
     * @param characteristicsInfo Optional configuration indicating which channel to write to.
     *                            Example: { serviceUUID: string, writeUUID: string, reliable?: boolean }
     */
    write(data: Uint8Array, characteristicsInfo?: any): Promise<void>;

    /**
     * Instructs the transport to begin emitting 'data' events for a specific channel/characteristic.
     * Some transports (like Serial) might ignore this if they emit all received data automatically.
     */
    startNotifications?(characteristicsInfo?: any): Promise<void>;

    /**
     * Returns whether the transport is currently connected.
     */
    isConnected(): boolean;

    /**
     * Returns the name of the connected device.
     */
    getDeviceName(): string | undefined;

    /**
     * Retrieves all discovered primary GATT services for the connected device.
     */
    getPrimaryServices?(): Promise<string[]>;

    /**
     * Retrieves all characteristics for a given service.
     */
    getCharacteristics?(serviceUUID: string): Promise<{ uuid: string, properties: any }[]>;
}
