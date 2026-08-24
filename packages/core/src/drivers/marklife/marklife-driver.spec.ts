import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EventEmitter from 'eventemitter3';
import { MarklifeDriver } from './marklife-driver';
import { IDeviceTransport, TransportEventMap } from '../../core/transports/transport.interface';
import { UniversalPrintOptions } from '../driver.interface';
import { monoPage } from '../../types/ink';

class MockTransport extends EventEmitter<TransportEventMap> implements IDeviceTransport {
    type = "Mock";
    public writeCount = 0;
    async connect() {}
    async disconnect() {}
    isConnected() { return true; }
    getDeviceName() { return "P50_Test"; }
    async write(data: Uint8Array) {
        this.writeCount += data.length;
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

    it('should run printEnd and trigger cut commands', async () => {
        const transport = new MockTransport();
        vi.spyOn(transport, 'write');
        await driver.bindTransport(transport);

        const endPromise = driver.printEnd();
        await endPromise;

        expect(transport.write).toHaveBeenCalledTimes(4); // purge, stop, alternate stop, auto pos
    });
});
