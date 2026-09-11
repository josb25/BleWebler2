import { describe, expect, it } from 'vitest';
import EventEmitter from 'eventemitter3';
import { CatPrinterDriver } from './catprinter-driver';
import type { IDeviceTransport, TransportEventMap } from '../../core/transports/transport.interface';
import { monoPage } from '../../types/ink';

class MockTransport extends EventEmitter<TransportEventMap> implements IDeviceTransport {
    readonly type = 'Mock BLE';
    readonly writes: Uint8Array[] = [];
    constructor(private readonly name: string) { super(); }
    async connect() {}
    async disconnect() {}
    isConnected() { return true; }
    getDeviceName() { return this.name; }
    async startNotifications() {}
    async write(data: Uint8Array) { this.writes.push(new Uint8Array(data)); }
}

describe('CatPrinterDriver', () => {
    it('matches documented models and rebadges without broad guesses', () => {
        const driver = new CatPrinterDriver('standard');
        expect(driver.isCompatible('GT01-ABCD')).toBe(true);
        expect(driver.isCompatible('PD01')).toBe(true);
        expect(driver.isCompatible('MXW010_1234')).toBe(true);
        expect(driver.isCompatible('MXW01')).toBe(false);
        expect(driver.isCompatible('Printer01')).toBe(false);
    });
    it('uses the prefixed dialect for LY10', async () => {
        const driver = new CatPrinterDriver('prefixed');
        const transport = new MockTransport('LY10-1234');
        await driver.bindTransport(transport);
        await driver.printInit({ density: 3, copies: 1 });
        expect([...transport.writes[0].slice(0, 3)]).toEqual([0x12, 0x51, 0x78]);
    });
    it('emits a complete one-column print job', async () => {
        const driver = new CatPrinterDriver('standard');
        const transport = new MockTransport('GT01');
        await driver.bindTransport(transport);
        await driver.printInit({ density: 3, copies: 1 });
        await driver.printPage(monoPage({ width: 1, height: 384, data: new Uint8Array(384 * 4).fill(255) }));
        await driver.printEnd();
        const stream = new Uint8Array(transport.writes.reduce((n, part) => n + part.length, 0));
        let offset = 0;
        for (const part of transport.writes) { stream.set(part, offset); offset += part.length; }
        const hex = [...stream].map(byte => byte.toString(16).padStart(2, '0')).join('');
        expect(hex).toContain('5178a6000b00aa551738445f5f5f44382c');
        expect(hex).toContain('5178bf0004007f7f7f03');
        expect(hex).toContain('5178a6000b00aa5517000000000000001711ff');
    });
});
