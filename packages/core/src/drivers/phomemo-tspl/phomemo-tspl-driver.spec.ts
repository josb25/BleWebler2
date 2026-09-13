import { describe, expect, it } from 'vitest';
import EventEmitter from 'eventemitter3';
import type { IDeviceTransport, TransportEventMap } from '../../core/transports/transport.interface';
import { monoPage } from '../../types/ink';
import { PhomemoTsplDriver } from './phomemo-tspl-driver';

class MockTransport extends EventEmitter<TransportEventMap> implements IDeviceTransport {
    readonly type = 'Mock USB';
    readonly writes: Uint8Array[] = [];
    async connect() {}
    async disconnect() {}
    isConnected() { return true; }
    getDeviceName() { return 'PM-241-BT'; }
    async write(data: Uint8Array) { this.writes.push(new Uint8Array(data)); }
}

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('PhomemoTsplDriver', () => {
    it('matches PM-241 product-name variants without claiming BLE support', () => {
        const driver = new PhomemoTsplDriver();
        expect(driver.isCompatible('PM-241-BT')).toBe(true);
        expect(driver.isCompatible('PM241')).toBe(true);
        expect(driver.isCompatible('PM-242')).toBe(false);
        expect(driver.connectionRequirements.services).toEqual([]);
    });

    it('emits a complete TSPL bitmap job using the selected label size', async () => {
        const driver = new PhomemoTsplDriver();
        const transport = new MockTransport();
        await driver.bindTransport(transport);
        await driver.printInit({
            density: 8,
            speed: 4,
            copies: 1,
            paper: { id: '4x6', name: '4x6', type: 'gap', tapeWidthMm: 102, labelLengthMm: 152, gapMm: 3 }
        });
        await driver.printPage(monoPage({ width: 1, height: 816, data: new Uint8Array(816 * 4).fill(255) }));
        await driver.printEnd();

        expect(text(transport.writes[0])).toBe('SIZE 102 mm,152 mm\r\n');
        expect(text(transport.writes[1])).toBe('GAP 3 mm,0 mm\r\n');
        expect(text(transport.writes[7])).toBe('BITMAP 0,0,102,1,0,');
        expect(transport.writes[8]).toEqual(new Uint8Array(102).fill(0xff));
        expect(text(transport.writes.at(-1)!)).toBe('PRINT 1,1\r\n');
    });
});

