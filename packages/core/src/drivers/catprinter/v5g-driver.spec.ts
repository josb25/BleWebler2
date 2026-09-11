import { describe, expect, it, vi } from 'vitest';
import EventEmitter from 'eventemitter3';
import type { IDeviceTransport, TransportEventMap } from '../../core/transports/transport.interface';
import { monoPage } from '../../types/ink';
import { CatPrinterV5gDriver } from './v5g-driver';

class MockTransport extends EventEmitter<TransportEventMap> implements IDeviceTransport {
    readonly type = 'mock';
    writes: Uint8Array[] = [];
    notificationOptions?: unknown;
    connect = vi.fn(async () => undefined);
    disconnect = vi.fn(async () => undefined);
    isConnected = () => true;
    getDeviceName = () => 'YT01';
    write = vi.fn(async (data: Uint8Array) => { this.writes.push(data); });
    startNotifications = vi.fn(async (options?: unknown) => { this.notificationOptions = options; });
}

describe('Catprinter V5G driver', () => {
    it('recognises canonical and rebranded advertised names', () => {
        const driver = new CatPrinterV5gDriver();
        expect(driver.isCompatible('YT01')).toBe(true);
        expect(driver.isCompatible('MX10_ABCD')).toBe(true);
        expect(driver.isCompatible('JL-BR22-1234')).toBe(true);
        expect(driver.isCompatible('UnknownPrinter')).toBe(false);
    });

    it('sends the V5G prologue, raw row, and epilogue to AE01', async () => {
        const driver = new CatPrinterV5gDriver();
        const transport = new MockTransport();
        await driver.bindTransport(transport);
        await driver.printInit({ density: 4, copies: 1 });
        await driver.printPage(monoPage({
            data: new Uint8Array(4 * 384).fill(0xff),
            width: 1,
            height: 384
        }));
        await driver.printEnd();

        expect(transport.startNotifications).toHaveBeenCalled();
        expect(transport.writes.map(packet => packet[2])).toEqual([
            0xf2, 0xa3, 0xa4, 0xa6, 0xaf, 0xbe, 0xbd,
            0xa2,
            0xbd, 0xa1, 0xa6, 0xa3, 0xa3
        ]);
        expect(transport.write).toHaveBeenCalledWith(
            expect.any(Uint8Array),
            expect.objectContaining({
                serviceUUID: '0000ae30-0000-1000-8000-00805f9b34fb',
                writeUUID: '0000ae01-0000-1000-8000-00805f9b34fb'
            })
        );
    });
});
