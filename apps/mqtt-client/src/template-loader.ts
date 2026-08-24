import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { parseTemplate } from '../../../packages/renderer/src/template/validate.js';
import type { LabelTemplate } from '../../../packages/renderer/src/template/template.js';

const MAX_TEMPLATE_BYTES = 2 * 1024 * 1024;
const TEMPLATE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function isValidTemplateId(id: string): boolean {
  return TEMPLATE_ID.test(id);
}

/** Load only a named ULT file below the configured template directory. */
export async function loadTemplateById(directory: string, id: string): Promise<LabelTemplate> {
  if (!isValidTemplateId(id)) throw new Error('Invalid templateId. Use letters, digits, underscores, or hyphens.');
  const root = resolve(directory);
  const candidate = resolve(root, `${id}.ult.json`);
  const fromRoot = relative(root, candidate);
  if (!fromRoot || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    throw new Error('Template path is outside the configured directory.');
  }
  const bytes = await readFile(candidate);
  if (bytes.byteLength > MAX_TEMPLATE_BYTES) throw new Error('Template exceeds the 2 MiB service limit.');
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('Template is not valid JSON.');
  }
  const parsed = parseTemplate(value);
  if (!parsed.ok) throw new Error(`Invalid ULT template: ${parsed.errors.join('; ')}`);
  return parsed.template;
}
