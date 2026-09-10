import { describe, it, expect, vi, beforeEach } from 'vitest';
import EventEmitter from 'eventemitter3';
import { MarklifeDriver } from './marklife-driver';
import type { IDeviceTransport, TransportEventMap } from '../../core/transports/transport.interface';
import { monoPage } from '../../types/ink';

class MockTransport extends EventEmitter<TransportEventMap> implements IDeviceTransport {
    type = "Mock";
    public writeCount = 0;
    public writes: Uint8Array[] = [];
    constructor(private readonly deviceName = "P50_Test") { super(); }
    async connect() {}
    async disconnect() {}
    isConnected() { return true; }
    getDeviceName() { return this.deviceName; }
    async write(data: Uint8Array) {
        this.writeCount += data.length;
        this.writes.push(new Uint8Array(data));
        // Simulate the device granting more flow-control credits as it drains
        // each chunk (0x01, <count>), so the credit-gated sender can progress.
        queueMicrotask(() => this.grantCredits());
    }
    // Implement startNotifications to trigger flow-control path
    async startNotifications() {
        // The real device issues an initial credit grant shortly after the
        // notify characteristic is subscribed. Fire it after bind completes.
        setTimeout(() => this.grantCredits(), 0);
    }
    private grantCredits() {
        this.emit('data', new Uint8Array([0x01, 0x04]));
    }
    clearWrites() {
        this.writeCount = 0;
        this.writes = [];
    }
}

// Removing fake timers so real timeouts process properly

describe('MarklifeDriver', () => {
    let driver: MarklifeDriver;

    beforeEach(() => {
        driver = new MarklifeDriver();
    });

    it('should match marklife compatible names', () => {
        expect(driver.isCompatible('P50')).toBe(true);
        expect(driver.isCompatible('P12_PRO')).toBe(true);
        expect(driver.isCompatible('marklife')).toBe(true);
        expect(driver.isCompatible('Printer01')).toBe(false);
        expect(driver.isCompatible('Niimbot_D11')).toBe(false);
    });

    it('should correctly expose capabilities based on transport name', async () => {
        const transport = new MockTransport();
        await driver.bindTransport(transport);
        const caps = driver.getCapabilities();

        expect(caps.canvasHeightPx).toBe(384); // Because getDeviceName returns "P50_Test"
        expect(caps.supportsSpeedMode).toBe(true);
        expect(caps.maxDensity).toBe(15);
    });

    it('exposes LP90 as a 96-dot legacy device without speed control', async () => {
        const transport = new MockTransport('LP90_Test');
        await driver.bindTransport(transport);

        expect(driver.getCapabilities()).toMatchObject({
            canvasHeightPx: 96,
            supportsSpeedMode: false,
            driverName: 'Marklife (Legacy L11)'
        });
    });

    it('should run printInit and send configuration commands', async () => {
        const transport = new MockTransport();
        vi.spyOn(transport, 'write');
        await driver.bindTransport(transport);
        
        const initPromise = driver.printInit({ paper: { id: 'test', name: 'test', type: 'gap', tapeWidthMm: 15 }, density: 10, speed: 2, copies: 1 });
        await initPromise;

        // Expect multiple writes: setPaperType, startJob, adjustPos, setDensity, setSpeed
        expect(transport.write).toHaveBeenCalledTimes(5);
    });

    it('should successfully run printPage without the dudu.js payload encoder crashing', async () => {
        const transport = new MockTransport();
        await driver.bindTransport(transport);

        // A tiny 2x2 white image
        const dummyImage = {
            data: new Uint8Array(16).fill(255),
            width: 2,
            height: 2
        };

        const pagePromise = driver.printPage(monoPage(dummyImage));
        await pagePromise;

        // Assuming dudu generated at least some payload bits
        expect(transport.writeCount).toBeGreaterThan(0);
    });

    it('assembles the LP90 legacy job and honours continuous feed overrides', async () => {
        const transport = new MockTransport('LP90_Test');
        await driver.bindTransport(transport);
        await driver.printInit({
            paper: { id: 'continuous', name: 'Continuous', type: 'continuous', tapeWidthMm: 15 },
            density: 10,
            speed: 2,
            copies: 1,
            feedOverrides: { feedBeforeMm: 1, feedAfterMm: 2 }
        });

        expect([...transport.writes[0]]).toEqual([0x10, 0xff, 0x10, 0x00, 0x06]);
        transport.clearWrites();

        const image = { data: new Uint8Array(2 * 96 * 4).fill(255), width: 2, height: 96 };
        await driver.printPage(monoPage(image));

        expect(transport.writes).toHaveLength(1);
        const job = transport.writes[0];
        expect([...job.slice(0, 15)]).toEqual(new Array(15).fill(0));
        expect([...job.slice(15, 19)]).toEqual([0x10, 0xff, 0xf1, 0x02]);
        expect([...job.slice(19, 22)]).toEqual([0x1b, 0x4a, 0x08]);
        expect([...job.slice(22, 30)]).toEqual([0x1d, 0x76, 0x30, 0x00, 0x0c, 0x00, 0x02, 0x00]);
        expect([...job.slice(-7, -4)]).toEqual([0x1b, 0x4a, 0x10]);
        expect([...job.slice(-4)]).toEqual([0x10, 0xff, 0xf1, 0x45]);
    });

    it('should run printEnd and trigger cut commands', async () => {
        const transport = new MockTransport();
        vi.spyOn(transport, 'write');
        await driver.bindTransport(transport);

        const endPromise = driver.printEnd();
        await endPromise;

        expect(transport.write).toHaveBeenCalledTimes(4); // purge, stop, alternate stop, auto pos
    });
});
