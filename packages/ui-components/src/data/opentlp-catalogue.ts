import rawSnapshot from './opentlp-snapshot.json';
import type { PrinterModelProfile } from 'universal-label-core';

export type CataloguePrinterProfile = Pick<
    PrinterModelProfile,
    'id' | 'brand' | 'model' | 'family' | 'aliases'
>;

export interface OpenTlpDevice {
    id: string;
    brand: string;
    model: string;
    aliases?: string[];
    rebadgeOf?: string | null;
    family?: string | null;
    status?: 'verified' | 'reported' | 'unverified' | null;
}

export interface OpenTlpSnapshot {
    source: string;
    schemaVersion: number;
    generated: string;
    licence: string;
    count: number;
    devices: OpenTlpDevice[];
}

export const OPENTLP_CATALOGUE_URL = 'https://josb25.github.io/opentlp/';
export const OPENTLP_SNAPSHOT = rawSnapshot as OpenTlpSnapshot;
export const OPENTLP_DEVICES: readonly OpenTlpDevice[] = OPENTLP_SNAPSHOT.devices;

const devicesById = new Map<string, OpenTlpDevice>();
for (const dev of OPENTLP_DEVICES) {
    if (dev?.id) {
        devicesById.set(dev.id, dev);
    }
}

/**
 * Infers protocol slug for Cat Printer profiles based on ID prefix.
 * - catprinter_v5g_ => catprinter-v5g
 * - catprinter_v5x_ => catprinter-v5x
 * - catprinter_v5c_ => catprinter-v5c
 * - catprinter_funny_lx_d => funny-lx
 * - remaining catprinter_ => tiny
 */
export function inferCatPrinterProtocolSlug(id: string): string | null {
    if (!id.startsWith('catprinter_')) {
        return null;
    }
    if (id.startsWith('catprinter_v5g_')) {
        return 'catprinter-v5g';
    }
    if (id.startsWith('catprinter_v5x_')) {
        return 'catprinter-v5x';
    }
    if (id.startsWith('catprinter_v5c_')) {
        return 'catprinter-v5c';
    }
    if (id.startsWith('catprinter_funny_lx_d')) {
        return 'funny-lx';
    }
    return 'tiny';
}

function normalizeModel(str: string | undefined | null): string {
    if (!str) return '';
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Matches a PrinterModelProfile against the pinned OpenTLP catalogue snapshot.
 * 1. Matches exact profile id against OpenTLP device id.
 * 2. For Cat Printer IDs only, falls back by normalized model plus inferred protocol slug.
 * Returns a fallback only when exactly one snapshot record matches.
 */
export function matchOpenTlpDevice(profile: CataloguePrinterProfile): OpenTlpDevice | undefined {
    // 1. Match exact id first
    const exact = devicesById.get(profile.id);
    if (exact) {
        return exact;
    }

    // 2. For Cat Printer IDs only, fall back by normalized model + protocol slug
    const protocolSlug = inferCatPrinterProtocolSlug(profile.id);
    if (!protocolSlug) {
        return undefined;
    }

    const normModel = normalizeModel(profile.model);
    if (!normModel) {
        return undefined;
    }

    const matches = OPENTLP_DEVICES.filter((dev) => {
        const family = dev.family ? dev.family.toLowerCase().trim() : '';
        if (family !== protocolSlug) {
            return false;
        }
        if (normalizeModel(dev.model) === normModel) {
            return true;
        }
        if (dev.aliases && dev.aliases.some((alias) => normalizeModel(alias) === normModel)) {
            return true;
        }
        return false;
    });

    if (matches.length === 1) {
        return matches[0];
    }

    return undefined;
}

/**
 * Combines profile brand/model/family/aliases with matched OpenTLP brand/model/family/aliases.
 */
export function getOpenTlpSearchTerms(profile: CataloguePrinterProfile, matched?: OpenTlpDevice | null): string[] {
    const dev = matched !== undefined ? matched : matchOpenTlpDevice(profile);
    const terms = new Set<string>();

    const add = (v: string | undefined | null) => {
        if (!v) return;
        const trimmed = v.trim();
        if (trimmed) {
            terms.add(trimmed);
        }
    };

    // Profile fields: brand, model, family, aliases
    add(profile.brand);
    add(profile.model);
    add(profile.family);
    if (profile.aliases) {
        for (const alias of profile.aliases) {
            add(alias);
        }
    }

    // Matched OpenTLP fields: brand, model, family, aliases
    if (dev) {
        add(dev.brand);
        add(dev.model);
        add(dev.family);
        if (dev.aliases) {
            for (const alias of dev.aliases) {
                add(alias);
            }
        }
    }

    return Array.from(terms);
}
