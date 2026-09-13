import { describe, it, expect } from 'vitest';
import {
    createDensityCommand,
    createEnableCommand,
    createFeedCommand,
    createPositionCommand,
    createStopCommand,
    createWakeCommand,
    isExcludedVariant,
    isPeriPageCompatible,
    matchPeriPageProfile,
    PERIPAGE_A6_HD_PROFILE,
    PERIPAGE_A6_PLUS_PROFILE,
    PERIPAGE_A6_PROFILE,
    PERIPAGE_BLE_ENDPOINTS,
    PERIPAGE_C6_PLUS_PROFILE,
    PERIPAGE_C6_PROFILE,
    PERIPAGE_DEVICE_DIMENSIONS,
    PERIPAGE_MODELS,
    PERIPAGE_P21_HD_PROFILE,
    PERIPAGE_P21_PROFILE,
    rasterHeader,
} from './peripage-protocol';

describe('PeriPage Protocol', () => {
    describe('Protocol Commands', () => {
        it('creates enable command (10 FF FE 01)', () => {
            const cmd = createEnableCommand();
            expect(cmd).toEqual(new Uint8Array([0x10, 0xff, 0xfe, 0x01]));
        });

        it('creates wake command (12 zero bytes)', () => {
            const cmd = createWakeCommand();
            expect(cmd.length).toBe(12);
            expect(cmd).toEqual(new Uint8Array(12));
        });

        it('creates density command clamped to 0..2 (10 FF 10 00 n)', () => {
            const cmd0 = createDensityCommand(0);
            expect(cmd0).toEqual(new Uint8Array([0x10, 0xff, 0x10, 0x00, 0x00]));

            const cmd1 = createDensityCommand(1);
            expect(cmd1).toEqual(new Uint8Array([0x10, 0xff, 0x10, 0x00, 0x01]));

            const cmd2 = createDensityCommand(2);
            expect(cmd2).toEqual(new Uint8Array([0x10, 0xff, 0x10, 0x00, 0x02]));

            const clampedHigh = createDensityCommand(300);
            expect(clampedHigh).toEqual(new Uint8Array([0x10, 0xff, 0x10, 0x00, 0x02]));

            const clampedLow = createDensityCommand(-5);
            expect(clampedLow).toEqual(new Uint8Array([0x10, 0xff, 0x10, 0x00, 0x00]));
        });

        it('creates position command (1D 0C)', () => {
            const cmd = createPositionCommand();
            expect(cmd).toEqual(new Uint8Array([0x1d, 0x0c]));
        });

        it('creates feed command clamped to 0..255 (1B 4A n)', () => {
            const cmd = createFeedCommand(0x48);
            expect(cmd).toEqual(new Uint8Array([0x1b, 0x4a, 0x48]));

            const clampedHigh = createFeedCommand(300);
            expect(clampedHigh).toEqual(new Uint8Array([0x1b, 0x4a, 0xff]));

            const clampedLow = createFeedCommand(-5);
            expect(clampedLow).toEqual(new Uint8Array([0x1b, 0x4a, 0x00]));
        });

        it('creates stop command (10 FF FE 45)', () => {
            const cmd = createStopCommand();
            expect(cmd).toEqual(new Uint8Array([0x10, 0xff, 0xfe, 0x45]));
        });

        it('creates standard ESC/POS GS v 0 raster header via shared rasterHeader', () => {
            // 384 dots = 48 bytes width, 2 rows
            const header384 = rasterHeader(48, 2);
            expect(header384).toEqual(new Uint8Array([0x1d, 0x76, 0x30, 0x00, 0x30, 0x00, 0x02, 0x00]));

            // 576 dots = 72 bytes width, 10 rows
            const header576 = rasterHeader(72, 10);
            expect(header576).toEqual(new Uint8Array([0x1d, 0x76, 0x30, 0x00, 0x48, 0x00, 0x0a, 0x00]));
        });
    });

    describe('BLE Endpoints', () => {
        it('uses full 128-bit UUID strings for service, write, and notify', () => {
            expect(PERIPAGE_BLE_ENDPOINTS.service).toBe('0000ff00-0000-1000-8000-00805f9b34fb');
            expect(PERIPAGE_BLE_ENDPOINTS.write).toBe('0000ff02-0000-1000-8000-00805f9b34fb');
            expect(PERIPAGE_BLE_ENDPOINTS.notify).toBe('0000ff01-0000-1000-8000-00805f9b34fb');
        });
    });

    describe('Device Dimensions and Model Profiles', () => {
        it('encodes correct dimensions for verified models including 203/304 P21 geometry', () => {
            expect(PERIPAGE_DEVICE_DIMENSIONS.A6).toEqual({ dots: 384, dpmm: 8 });
            expect(PERIPAGE_DEVICE_DIMENSIONS.A6_HD).toEqual({ dots: 384, dpmm: 12 });
            expect(PERIPAGE_DEVICE_DIMENSIONS.A6_PLUS).toEqual({ dots: 576, dpmm: 12 });
            expect(PERIPAGE_DEVICE_DIMENSIONS.C6).toEqual({ dots: 384, dpmm: 8 });
            expect(PERIPAGE_DEVICE_DIMENSIONS.C6_PLUS).toEqual({ dots: 576, dpmm: 12 });
            expect(PERIPAGE_DEVICE_DIMENSIONS.P21_SD).toEqual({ dots: 384, dpmm: 8 });
            expect(PERIPAGE_DEVICE_DIMENSIONS.P21_HD).toEqual({ dots: 384, dpmm: 12 });

            // Specific 203/304 P21 geometry checks
            expect(PERIPAGE_P21_PROFILE.capabilities.canvasHeightPx).toBe(384);
            expect(PERIPAGE_P21_PROFILE.capabilities.dpmm).toBe(8);
            expect(PERIPAGE_P21_HD_PROFILE.capabilities.canvasHeightPx).toBe(384);
            expect(PERIPAGE_P21_HD_PROFILE.capabilities.dpmm).toBe(12);
        });

        it('marks all profiles as Untested pending hardware validation', () => {
            for (const profile of PERIPAGE_MODELS) {
                expect(profile.supportLevel).toBe('Untested');
                expect(profile.notes).toContain('Hardware validation is pending');
                expect(profile.capabilities.driverName).toBe('PeriPage raw GS v 0');
            }
        });

        it('documents that only A6+ BLE endpoint is hardware-observed', () => {
            expect(PERIPAGE_A6_PLUS_PROFILE.notes).toContain('hardware-observed on A6+');
            expect(PERIPAGE_A6_PROFILE.notes).toContain('untested/inferred from A6+');
            expect(PERIPAGE_P21_PROFILE.notes).toContain('untested/inferred from A6+');
        });

        it('enumerates all 7 distinct physical geometry profiles with unique IDs', () => {
            expect(PERIPAGE_MODELS).toHaveLength(7);
            const ids = PERIPAGE_MODELS.map(m => m.id);
            expect(new Set(ids).size).toBe(7);
            expect(ids).toEqual([
                'peripage_a6_203',
                'peripage_a6_304',
                'peripage_a6_plus',
                'peripage_c6',
                'peripage_c6_plus',
                'peripage_p21_203',
                'peripage_p21_304',
            ]);
        });
    });

    describe('Strict Negative Matches', () => {
        it('rejects other brands sharing model numbers (Nelko P21, Phomemo A6, Marklife P12)', () => {
            expect(matchPeriPageProfile('Nelko P21')).toBeUndefined();
            expect(matchPeriPageProfile('Nelko P21 Pro')).toBeUndefined();
            expect(matchPeriPageProfile('Phomemo A6')).toBeUndefined();
            expect(matchPeriPageProfile('Phomemo_A6')).toBeUndefined();
            expect(matchPeriPageProfile('Marklife P12')).toBeUndefined();
            expect(isPeriPageCompatible('Nelko P21')).toBe(false);
            expect(isPeriPageCompatible('Phomemo A6')).toBe(false);
        });

        it('rejects bare names and prefixes without qualification', () => {
            const bareNames = ['A6', 'C6', 'P21', 'PPG', 'PeriPage', 'A6+', 'C6+', 'P21+'];
            for (const name of bareNames) {
                expect(matchPeriPageProfile(name)).toBeUndefined();
                expect(isPeriPageCompatible(name)).toBe(false);
            }
        });

        it('rejects ambiguous PPG_P21 and PeriPage_P21 without resolution suffix', () => {
            const ambiguousNames = [
                'PPG_P21',
                'ppg_p21',
                'PPG_P21_1234',
                'PPG-P21',
                'PeriPage_P21',
                'PeriPage P21',
            ];
            for (const name of ambiguousNames) {
                expect(matchPeriPageProfile(name)).toBeUndefined();
                expect(isPeriPageCompatible(name)).toBe(false);
            }
        });

        it('identifies and strictly excludes all P21+ / PPG_P21+ / P21 Plus spellings', () => {
            const excludedNames = [
                'PPG_P21+',
                'ppg_p21+',
                'P21 Plus',
                'p21 plus',
                'P21+',
                'p21+',
                'PeriPage_P21+',
                'PeriPage P21 Plus',
                'PPG_P21+_54AF',
                'p21+compressed',
                'ppg_p21_plus',
                'PPG-P21+',
            ];
            for (const name of excludedNames) {
                expect(isExcludedVariant(name)).toBe(true);
                expect(matchPeriPageProfile(name)).toBeUndefined();
                expect(isPeriPageCompatible(name)).toBe(false);
            }
        });

        it('rejects empty or invalid inputs', () => {
            expect(matchPeriPageProfile('')).toBeUndefined();
            expect(matchPeriPageProfile('   ')).toBeUndefined();
            expect(matchPeriPageProfile(null as unknown as string)).toBeUndefined();
            expect(matchPeriPageProfile(undefined as unknown as string)).toBeUndefined();
        });
    });

    describe('Exact Positive Raw-Family Matches', () => {
        it('matches A6 203dpi 384 dots (PeriPage_A6, PPG_A6_SD)', () => {
            expect(matchPeriPageProfile('PeriPage_A6')).toBe(PERIPAGE_A6_PROFILE);
            expect(matchPeriPageProfile('PeriPage A6')).toBe(PERIPAGE_A6_PROFILE);
            expect(matchPeriPageProfile('PPG_A6_SD')).toBe(PERIPAGE_A6_PROFILE);
            expect(matchPeriPageProfile('PPG_A6_SD_1234')).toBe(PERIPAGE_A6_PROFILE);
        });

        it('matches A6 304dpi 384 dots (PPG_A6_HD, PPG_A6_UD, PPG_A6_UHD)', () => {
            expect(matchPeriPageProfile('PPG_A6_HD')).toBe(PERIPAGE_A6_HD_PROFILE);
            expect(matchPeriPageProfile('PPG_A6_UD')).toBe(PERIPAGE_A6_HD_PROFILE);
            expect(matchPeriPageProfile('PPG_A6_UHD')).toBe(PERIPAGE_A6_HD_PROFILE);
            expect(matchPeriPageProfile('PPG_A6_HD_5678')).toBe(PERIPAGE_A6_HD_PROFILE);
        });

        it('matches tested A6+ BLE name forms (PeriPage+XXXX, PeriPage+XXXX_BLE, PeriPage_A6+)', () => {
            expect(matchPeriPageProfile('PeriPage+9B34')).toBe(PERIPAGE_A6_PLUS_PROFILE);
            expect(matchPeriPageProfile('PeriPage+9B34_BLE')).toBe(PERIPAGE_A6_PLUS_PROFILE);
            expect(matchPeriPageProfile('PeriPage+ABCD')).toBe(PERIPAGE_A6_PLUS_PROFILE);
            expect(matchPeriPageProfile('PeriPage_A6+')).toBe(PERIPAGE_A6_PLUS_PROFILE);
            expect(matchPeriPageProfile('PeriPage A6+')).toBe(PERIPAGE_A6_PLUS_PROFILE);
        });

        it('matches C6 384 dots / 8 dpmm and C6+ 576 dots / 12 dpmm', () => {
            expect(matchPeriPageProfile('PeriPage_C6')).toBe(PERIPAGE_C6_PROFILE);
            expect(matchPeriPageProfile('PeriPage C6')).toBe(PERIPAGE_C6_PROFILE);
            expect(matchPeriPageProfile('PeriPage_C6+')).toBe(PERIPAGE_C6_PLUS_PROFILE);
            expect(matchPeriPageProfile('PeriPage C6+')).toBe(PERIPAGE_C6_PLUS_PROFILE);
        });

        it('matches P21 SD 203dpi (PPG_P21_SD)', () => {
            expect(matchPeriPageProfile('PPG_P21_SD')).toBe(PERIPAGE_P21_PROFILE);
            expect(matchPeriPageProfile('PPG_P21_SD_1234')).toBe(PERIPAGE_P21_PROFILE);
        });

        it('matches P21 HD 304dpi (PPG_P21_HD, PPG_P21_UD, PPG_P21_UHD)', () => {
            expect(matchPeriPageProfile('PPG_P21_HD')).toBe(PERIPAGE_P21_HD_PROFILE);
            expect(matchPeriPageProfile('PPG_P21_UD')).toBe(PERIPAGE_P21_HD_PROFILE);
            expect(matchPeriPageProfile('PPG_P21_UHD')).toBe(PERIPAGE_P21_HD_PROFILE);
            expect(matchPeriPageProfile('PPG_P21_HD_9999')).toBe(PERIPAGE_P21_HD_PROFILE);
        });
    });
});
