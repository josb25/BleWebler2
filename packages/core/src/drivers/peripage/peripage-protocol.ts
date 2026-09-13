import type { PrinterModelProfile, SupportLevel } from '../driver.interface';
export { peripageRasterHeader as rasterHeader } from './peripage-raster';

/**
 * BLE endpoints for the PeriPage raw-raster family.
 * Only the A6+ endpoint is hardware-observed; endpoints for other models are untested/inferred.
 */
export const PERIPAGE_BLE_ENDPOINTS = {
    service: '0000ff00-0000-1000-8000-00805f9b34fb',
    write: '0000ff02-0000-1000-8000-00805f9b34fb',
    notify: '0000ff01-0000-1000-8000-00805f9b34fb',
    serviceUuid: '0000ff00-0000-1000-8000-00805f9b34fb',
    writeUuid: '0000ff02-0000-1000-8000-00805f9b34fb',
    notifyUuid: '0000ff01-0000-1000-8000-00805f9b34fb',
} as const;

/**
 * Physical device dimensions for raw-raster PeriPage models.
 */
export const PERIPAGE_DEVICE_DIMENSIONS = {
    A6: { dots: 384, dpmm: 8 },
    A6_HD: { dots: 384, dpmm: 12 },
    A6_PLUS: { dots: 576, dpmm: 12 },
    C6: { dots: 384, dpmm: 8 },
    C6_PLUS: { dots: 576, dpmm: 12 },
    P21_SD: { dots: 384, dpmm: 8 },
    P21_HD: { dots: 384, dpmm: 12 },
} as const;

const UNTESTED_SUPPORT: SupportLevel = 'Untested';

/**
 * Canonical physical printer model profiles.
 * Strict alias deduplication: Each profile enumerates exact firmware advertising names.
 * All models untested pending hardware validation; only A6+ BLE endpoint is hardware-observed.
 */
export const PERIPAGE_A6_PROFILE: PrinterModelProfile = {
    id: 'peripage_a6_203',
    brand: 'PeriPage',
    model: 'A6 (203 dpi)',
    family: 'PeriPage raw GS v 0',
    supportLevel: UNTESTED_SUPPORT,
    notes: 'Raw raster protocol (384 dots, 8 dpmm). BLE endpoint untested/inferred from A6+. Hardware validation is pending.',
    capabilities: {
        maxDensity: 2,
        canvasHeightPx: PERIPAGE_DEVICE_DIMENSIONS.A6.dots,
        supportsSpeedMode: false,
        colorSupport: { type: 'monochrome', channels: 1 },
        dpmm: PERIPAGE_DEVICE_DIMENSIONS.A6.dpmm,
        driverName: 'PeriPage raw GS v 0',
    },
};

export const PERIPAGE_A6_HD_PROFILE: PrinterModelProfile = {
    id: 'peripage_a6_304',
    brand: 'PeriPage',
    model: 'A6 (304 dpi)',
    family: 'PeriPage raw GS v 0',
    supportLevel: UNTESTED_SUPPORT,
    notes: 'Raw raster protocol (384 dots, 12 dpmm). BLE endpoint untested/inferred from A6+. Hardware validation is pending.',
    capabilities: {
        maxDensity: 2,
        canvasHeightPx: PERIPAGE_DEVICE_DIMENSIONS.A6_HD.dots,
        supportsSpeedMode: false,
        colorSupport: { type: 'monochrome', channels: 1 },
        dpmm: PERIPAGE_DEVICE_DIMENSIONS.A6_HD.dpmm,
        driverName: 'PeriPage raw GS v 0',
    },
};

export const PERIPAGE_A6_PLUS_PROFILE: PrinterModelProfile = {
    id: 'peripage_a6_plus',
    brand: 'PeriPage',
    model: 'A6+',
    family: 'PeriPage raw GS v 0',
    supportLevel: UNTESTED_SUPPORT,
    notes: 'Raw raster protocol (576 dots, 12 dpmm). BLE endpoint hardware-observed on A6+. Hardware validation is pending.',
    capabilities: {
        maxDensity: 2,
        canvasHeightPx: PERIPAGE_DEVICE_DIMENSIONS.A6_PLUS.dots,
        supportsSpeedMode: false,
        colorSupport: { type: 'monochrome', channels: 1 },
        dpmm: PERIPAGE_DEVICE_DIMENSIONS.A6_PLUS.dpmm,
        driverName: 'PeriPage raw GS v 0',
    },
};

export const PERIPAGE_C6_PROFILE: PrinterModelProfile = {
    id: 'peripage_c6',
    brand: 'PeriPage',
    model: 'C6',
    family: 'PeriPage raw GS v 0',
    supportLevel: UNTESTED_SUPPORT,
    notes: 'Raw raster protocol (384 dots, 8 dpmm). BLE endpoint untested/inferred from A6+. Hardware validation is pending.',
    capabilities: {
        maxDensity: 2,
        canvasHeightPx: PERIPAGE_DEVICE_DIMENSIONS.C6.dots,
        supportsSpeedMode: false,
        colorSupport: { type: 'monochrome', channels: 1 },
        dpmm: PERIPAGE_DEVICE_DIMENSIONS.C6.dpmm,
        driverName: 'PeriPage raw GS v 0',
    },
};

export const PERIPAGE_C6_PLUS_PROFILE: PrinterModelProfile = {
    id: 'peripage_c6_plus',
    brand: 'PeriPage',
    model: 'C6+',
    family: 'PeriPage raw GS v 0',
    supportLevel: UNTESTED_SUPPORT,
    notes: 'Raw raster protocol (576 dots, 12 dpmm). BLE endpoint untested/inferred from A6+. Hardware validation is pending.',
    capabilities: {
        maxDensity: 2,
        canvasHeightPx: PERIPAGE_DEVICE_DIMENSIONS.C6_PLUS.dots,
        supportsSpeedMode: false,
        colorSupport: { type: 'monochrome', channels: 1 },
        dpmm: PERIPAGE_DEVICE_DIMENSIONS.C6_PLUS.dpmm,
        driverName: 'PeriPage raw GS v 0',
    },
};

export const PERIPAGE_P21_PROFILE: PrinterModelProfile = {
    id: 'peripage_p21_203',
    brand: 'PeriPage',
    model: 'P21 (203 dpi)',
    family: 'PeriPage raw GS v 0',
    supportLevel: UNTESTED_SUPPORT,
    notes: 'Raw raster protocol (384 dots, 8 dpmm). BLE endpoint untested/inferred from A6+. Hardware validation is pending. Excludes compressed P21+ variants.',
    capabilities: {
        maxDensity: 2,
        canvasHeightPx: PERIPAGE_DEVICE_DIMENSIONS.P21_SD.dots,
        supportsSpeedMode: false,
        colorSupport: { type: 'monochrome', channels: 1 },
        dpmm: PERIPAGE_DEVICE_DIMENSIONS.P21_SD.dpmm,
        driverName: 'PeriPage raw GS v 0',
    },
};

export const PERIPAGE_P21_SD_PROFILE = PERIPAGE_P21_PROFILE;

export const PERIPAGE_P21_HD_PROFILE: PrinterModelProfile = {
    id: 'peripage_p21_304',
    brand: 'PeriPage',
    model: 'P21 (304 dpi)',
    family: 'PeriPage raw GS v 0',
    supportLevel: UNTESTED_SUPPORT,
    notes: 'Raw raster protocol (384 dots, 12 dpmm). BLE endpoint untested/inferred from A6+. Hardware validation is pending. Excludes compressed P21+ variants.',
    capabilities: {
        maxDensity: 2,
        canvasHeightPx: PERIPAGE_DEVICE_DIMENSIONS.P21_HD.dots,
        supportsSpeedMode: false,
        colorSupport: { type: 'monochrome', channels: 1 },
        dpmm: PERIPAGE_DEVICE_DIMENSIONS.P21_HD.dpmm,
        driverName: 'PeriPage raw GS v 0',
    },
};

/**
 * Deduplicated list of geometry profiles for the one PeriPage raw raster driver.
 */
export const PERIPAGE_MODELS: PrinterModelProfile[] = [
    PERIPAGE_A6_PROFILE,
    PERIPAGE_A6_HD_PROFILE,
    PERIPAGE_A6_PLUS_PROFILE,
    PERIPAGE_C6_PROFILE,
    PERIPAGE_C6_PLUS_PROFILE,
    PERIPAGE_P21_PROFILE,
    PERIPAGE_P21_HD_PROFILE,
];

/**
 * Checks if a device name indicates a compressed or incompatible protocol variant
 * that MUST NOT be handled by this raw raster driver.
 *
 * Specifically, PeriPage P21+ (and PPG_P21+) uses a compressed protocol and
 * must never match raw profiles.
 */
export function isExcludedVariant(deviceName: string): boolean {
    if (!deviceName || typeof deviceName !== 'string') return false;
    const name = deviceName.trim();
    if (/(?:^|[-_ ])p21\s*\+/i.test(name)) return true;
    if (/ppg[-_]?p21\s*\+/i.test(name)) return true;
    if (/(?:^|[-_ ])p21[-_ ]?plus/i.test(name)) return true;
    if (/ppg[-_]?p21[-_ ]?plus/i.test(name)) return true;
    if (/^p21\+/i.test(name)) return true;
    return false;
}

/**
 * Strict profile matcher for PeriPage raw raster devices.
 * Requires explicit PeriPage/PPG prefixes and excludes bare or ambiguous model names.
 */
export function matchPeriPageProfile(deviceName: string): PrinterModelProfile | undefined {
    if (!deviceName || typeof deviceName !== 'string') return undefined;
    const trimmed = deviceName.trim();

    // 1. Strict exclusion check for compressed variants (P21+ etc.)
    if (isExcludedVariant(trimmed)) {
        return undefined;
    }

    // 2. Reject bare names and other brands
    // All valid PeriPage models begin with PeriPage or PPG
    if (!/^(?:peripage|ppg)(?:$|[-_ +])/i.test(trimmed)) {
        return undefined;
    }

    // Reject bare 'PPG' or 'PeriPage' without model
    if (/^(?:peripage|ppg)$/i.test(trimmed)) {
        return undefined;
    }

    // 3. Ambiguous P21 resolution check: PPG_P21 without resolution suffix must NOT auto-match
    if (/^(?:peripage|ppg)[-_ ]?p21(?:$|[-_ ](?!sd|hd|ud|uhd))/i.test(trimmed)) {
        return undefined;
    }

    // 4. High-resolution Plus models
    // Tested A6+ BLE advertising name: PeriPage+XXXX or PeriPage+XXXX_BLE
    if (/^peripage\+[0-9a-z]+(?:_ble)?$/i.test(trimmed) || /^(?:peripage|ppg)[-_ ]?a6\+(?:$|[-_ ])/i.test(trimmed)) {
        return PERIPAGE_A6_PLUS_PROFILE;
    }
    if (/^(?:peripage|ppg)[-_ ]?c6\+(?:$|[-_ ])/i.test(trimmed)) {
        return PERIPAGE_C6_PLUS_PROFILE;
    }

    // 5. High-resolution (304dpi / 12dpmm) models
    if (/^ppg[-_ ]?a6[-_ ]?(?:hd|ud|uhd)(?:$|[-_ ])/i.test(trimmed)) {
        return PERIPAGE_A6_HD_PROFILE;
    }
    if (/^ppg[-_ ]?p21[-_ ]?(?:hd|ud|uhd)(?:$|[-_ ])/i.test(trimmed)) {
        return PERIPAGE_P21_HD_PROFILE;
    }

    // 6. Standard resolution (203dpi / 8dpmm) models
    if (/^ppg[-_ ]?a6[-_ ]?sd(?:$|[-_ ])/i.test(trimmed) || /^peripage[-_ ]?a6(?:$|[-_ ])/i.test(trimmed)) {
        return PERIPAGE_A6_PROFILE;
    }
    if (/^peripage[-_ ]?c6(?:$|[-_ ])/i.test(trimmed)) {
        return PERIPAGE_C6_PROFILE;
    }
    if (/^ppg[-_ ]?p21[-_ ]?sd(?:$|[-_ ])/i.test(trimmed)) {
        return PERIPAGE_P21_PROFILE;
    }

    return undefined;
}

/**
 * Determines whether a device name is compatible with this raw raster driver.
 */
export function isPeriPageCompatible(deviceName: string): boolean {
    return matchPeriPageProfile(deviceName) !== undefined;
}

/* =========================================================================
 * Protocol Command Builders
 * ========================================================================= */

/**
 * Enable command: 10 FF FE 01
 */
export function createEnableCommand(): Uint8Array {
    return new Uint8Array([0x10, 0xFF, 0xFE, 0x01]);
}

/**
 * Wake command: 12 zero bytes
 */
export function createWakeCommand(): Uint8Array {
    return new Uint8Array(12);
}

/**
 * Density command: 10 FF 10 00 n
 * Clamped to 0..2.
 * @param density Density level (clamped to 0..2, default 2)
 */
export function createDensityCommand(density: number): Uint8Array {
    const n = Math.max(0, Math.min(2, Math.round(Number.isFinite(density) ? density : 2)));
    return new Uint8Array([0x10, 0xFF, 0x10, 0x00, n]);
}

/**
 * Position command: 1D 0C
 */
export function createPositionCommand(): Uint8Array {
    return new Uint8Array([0x1D, 0x0C]);
}

/**
 * Feed command: 1B 4A n
 * Clamped to 0..255.
 * @param feedDistance Feed distance in dots (clamped to 0..255)
 */
export function createFeedCommand(feedDistance: number): Uint8Array {
    const n = Math.max(0, Math.min(255, Math.round(Number.isFinite(feedDistance) ? feedDistance : 0x48)));
    return new Uint8Array([0x1B, 0x4A, n]);
}

/**
 * Stop command: 10 FF FE 45
 */
export function createStopCommand(): Uint8Array {
    return new Uint8Array([0x10, 0xFF, 0xFE, 0x45]);
}
