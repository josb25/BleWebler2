import { describe, expect, it } from 'vitest';
import { collectOptionalServices } from './capacitor-ble-transport';

describe('Capacitor BLE discovery services', () => {
    it('uses services supplied by the registered drivers', () => {
        const result = collectOptionalServices([
            { services: ['0000ae30-0000-1000-8000-00805f9b34fb'] },
            { services: ['0000ff00-0000-1000-8000-00805f9b34fb'] }
        ], ['00001800-0000-1000-8000-00805f9b34fb']);

        expect(result).toEqual([
            '00001800-0000-1000-8000-00805f9b34fb',
            '0000ae30-0000-1000-8000-00805f9b34fb',
            '0000ff00-0000-1000-8000-00805f9b34fb'
        ]);
    });

    it('deduplicates UUIDs regardless of case and punctuation', () => {
        expect(collectOptionalServices([
            { services: ['AE30', 'ae30', '0000AE30-0000-1000-8000-00805F9B34FB'] }
        ])).toEqual(['ae30']);
    });
});
