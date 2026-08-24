import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isValidTemplateId, loadTemplateById } from './template-loader.js';

describe('MQTT template loader', () => {
  it('rejects paths and traversal strings', () => {
    expect(isValidTemplateId('../asset-tag')).toBe(false);
    expect(isValidTemplateId('folder/asset-tag')).toBe(false);
    expect(isValidTemplateId('C:\\labels\\asset-tag')).toBe(false);
  });

  it('loads and validates a named ULT example', async () => {
    const examples = resolve(import.meta.dirname, '../../../packages/ult/examples');
    const template = await loadTemplateById(examples, 'asset-tag');
    expect(template.kind).toBe('label-template');
    expect(template.version).toBe(1);
  });
});
