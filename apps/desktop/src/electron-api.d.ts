interface BluetoothPickerDevice {
    deviceId: string;
    deviceName: string;
}

interface UsbPickerDevice {
    deviceId: string;
    productName?: string;
    vendorId?: number;
    productId?: number;
}

interface SerialPickerDevice {
    portId: string;
    displayName?: string;
    portName: string;
    vendorId?: string;
    productId?: string;
}

interface ElectronAPI {
    onBluetoothDeviceList(callback: (devices: BluetoothPickerDevice[]) => void): () => void;
    chooseBluetoothDevice(deviceId: string): void;
    cancelBluetoothDevice(): void;
    onUsbDeviceList(callback: (devices: UsbPickerDevice[]) => void): () => void;
    chooseUsbDevice(deviceId: string): void;
    cancelUsbDevice(): void;
    onSerialDeviceList(callback: (devices: SerialPickerDevice[]) => void): () => void;
    chooseSerialDevice(portId: string): void;
    cancelSerialDevice(): void;
}

interface Window {
    electronAPI: ElectronAPI;
}
