import { describe, expect, it, vi } from 'vitest';
import { CapacitorUsbTransport } from './capacitor-usb-transport';

const handle = () => ({ remove: vi.fn(async () => undefined) });

describe('CapacitorUsbTransport', () => {
    it('requests permission, opens the port and writes binary data', async () => {
        let written = '';
        const api = {
            listDevices: vi.fn(async () => ({ devices: [{
                deviceId: 'usb-1', vendorId: 1, productId: 2,
                deviceName: 'P12 USB', hasPermission: false
            }] })),
            requestPermission: vi.fn(async () => ({ granted: true })),
            open: vi.fn(async () => ({ portId: 'port-1' })),
            close: vi.fn(async () => undefined),
            setParameters: vi.fn(async () => undefined),
            write: vi.fn(async ({ data }: { data: string }) => {
                written = data;
                return { bytesWritten: 4 };
            }),
            startReading: vi.fn(async () => undefined),
            stopReading: vi.fn(async () => undefined),
            addListener: vi.fn(async () => handle())
        };
        const transport = new CapacitorUsbTransport({}, api as never);

        await transport.connect();
        await transport.write(Uint8Array.of(0, 127, 128, 255));

        expect(api.requestPermission).toHaveBeenCalledWith({ deviceId: 'usb-1' });
        expect(api.setParameters).toHaveBeenCalledWith({
            portId: 'port-1', baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none'
        });
        expect(Array.from(Uint8Array.from(atob(written), char => char.charCodeAt(0)))).toEqual([0, 127, 128, 255]);
    });
});
