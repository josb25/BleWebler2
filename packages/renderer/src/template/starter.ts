import assetTag from 'universal-label-template/examples/asset-tag.ult.json';
import barcodeProduct from 'universal-label-template/examples/barcode-product.ult.json';
import hazardLabel from 'universal-label-template/examples/hazard-label.ult.json';
import nameBadge from 'universal-label-template/examples/name-badge.ult.json';
import priceTag from 'universal-label-template/examples/price-tag.ult.json';
import qrUrlCard from 'universal-label-template/examples/qr-url-card.ult.json';
import retailPriceTag from 'universal-label-template/examples/retail-price-tag.ult.json';
import spineLabel from 'universal-label-template/examples/spine-label.ult.json';
import type { LabelTemplate } from './template';
import { parseTemplate } from './validate';

const bundled: unknown[] = [
    assetTag,
    barcodeProduct,
    hazardLabel,
    nameBadge,
    priceTag,
    qrUrlCard,
    retailPriceTag,
    spineLabel
];

function validateBundledTemplates(): LabelTemplate[] {
    return bundled.map(raw => {
        const parsed = parseTemplate(raw);
        if (!parsed.ok) {
            throw new Error(`Invalid bundled template: ${parsed.errors.join('; ')}`);
        }
        return parsed.template;
    });
}

/** Curated, offline starter library installed on the first app launch. */
export const STARTER_TEMPLATES: readonly LabelTemplate[] = validateBundledTemplates();
