import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DummyDriver } from './dummy-driver';
import { UniversalPrintOptions } from '../driver.interface';
import { monoPage } from '../../types/ink';

describe('DummyDriver', () => {
    let driver: DummyDriver;

    beforeEach(() => {
        driver = new DummyDriver();
    });

    it('should be compatible with names containing dummy or virtual', () => {
        expect(driver.isCompatible('My Dummy Printer')).toBe(true);
        expect(driver.isCompatible('Virtual Device')).toBe(true);
        expect(driver.isCompatible('Real Hardware')).toBe(false);
    });

    it('should allow setting configuration and reflecting it in getCapabilities', () => {
        driver.setConfig(200, 10, 12, { type: 'color', shades: 256 });
        const caps = driver.getCapabilities();

        expect(caps.canvasHeightPx).toBe(200);
        expect(caps.maxDensity).toBe(10);
        expect(caps.dpmm).toBe(12);
        expect(caps.colorSupport.type).toBe('color');
        expect(caps.colorSupport.shades).toBe(256);
    });

    it('should log printInit securely without throwing', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const options: UniversalPrintOptions = { density: 5, copies: 1, paper: { id: 'test', name: 'test', type: 'continuous', tapeWidthMm: 15 } };
        await expect(driver.printInit(options)).resolves.toBeUndefined();
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[DummyDriver] Print Initialized. Options:'), options);
        consoleSpy.mockRestore();
    });

    it('should log printPage including dimensions securely', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const img = {
            data: new Uint8Array([255, 255, 255, 255]),
            width: 1,
            height: 1
        };
        await expect(driver.printPage(monoPage(img))).resolves.toBeUndefined();
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[DummyDriver] Receiving Page Data... Width: 1px, Height: 1px'));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[DummyDriver] Payload Size: 4 bytes'));
        consoleSpy.mockRestore();
    });

    it('should log printEnd securely', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        await expect(driver.printEnd()).resolves.toBeUndefined();
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[DummyDriver] Print Job Ended.'));
        consoleSpy.mockRestore();
    });
});
