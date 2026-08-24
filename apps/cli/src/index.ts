#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrintManager, type IDeviceTransport } from 'universal-label-core';
import { DummyTransport } from 'universal-label-core/transport/dummy';
import { NodeBleTransport } from 'universal-label-core/transport/node';
import { NodeSerialTransport } from 'universal-label-core/transport/node-serial';
import { NodeUsbTransport } from 'universal-label-core/transport/node-usb';
import { parseTemplate } from '../../../packages/renderer/src/template/validate.js';
import { rasterizeDesign } from '../../../packages/renderer/src/raster/rasterize.js';
import { resolveTemplate, type LabelTemplate, type TemplateParam } from '../../../packages/renderer/src/template/template.js';
import { measureTextNode, nodeRasterEnv } from './node-raster.js';

const MAX_TEMPLATE_BYTES = 2 * 1024 * 1024;
type TransportName = 'dummy' | 'ble' | 'usb' | 'serial';

interface CliOptions {
  help: boolean;
  list: boolean;
  template?: string;
  transport: TransportName;
  deviceId?: string;
  serialPath?: string;
  serialName?: string;
  tapeWidthMm?: number;
  labelLengthMm?: number;
  density?: number;
  copies: number;
  params: Record<string, string>;
}

const HELP = `BleWebler2 CLI

Render a Universal Label Template and print it locally. The virtual printer is
the default, so running a command never selects physical hardware by accident.

Usage:
  npm run cli -- --template <file.ult.json> [options]
  npm run cli -- --list --transport ble

Options:
  --template <path>         ULT 1.0 template file
  --transport <name>        dummy (default), ble, usb, or serial
  --list                    list discoverable BLE devices and exit
  --device-id <id>          exact BLE device id (required for BLE printing)
  --serial-path <path>      exact serial/RFCOMM port path
  --serial-name <name>      printer name used for safe driver matching
  --tape-width <mm>         physical tape width
  --length <mm>             label length
  --density <number>        printer density; defaults to device maximum
  --copies <number>         1-100 (default: 1)
  --param <name=value>      template parameter; may be repeated
  --help                    show this help
`;

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }
  if (options.list) {
    if (options.transport !== 'ble') throw new Error('--list currently supports only --transport ble.');
    const transport = new NodeBleTransport();
    const devices = await transport.scanDevices(10_000);
    if (!devices.length) process.stdout.write('No BLE devices found.\n');
    for (const device of devices) process.stdout.write(`${device.id}\t${device.name ?? '(unnamed)'}\n`);
    return;
  }
  if (!options.template) throw new Error('Missing --template. Run with --help for usage.');

  const templatePath = resolve(process.env.INIT_CWD ?? process.cwd(), options.template);
  const template = await loadTemplate(templatePath);
  const manager = new PrintManager();
  const transport = await createTransport(options);
  await connect(manager, transport, options);
  try {
    const capabilities = manager.getCapabilities();
    const tapeWidthMm = positive(options.tapeWidthMm ?? template.adaptivity.designedFor.tapeWidthMm, 'tape width');
    const labelLengthMm = positive(
      options.labelLengthMm ?? template.adaptivity.designedFor.labelLengthMm ?? 40,
      'label length'
    );
    const heightPx = capabilities.canvasHeightPx;
    const widthPx = Math.max(1, Math.round(labelLengthMm * capabilities.dpmm));
    const params = coerceParams(options.params, template.params);
    const resolved = resolveTemplate(template, {
      widthPx,
      heightPx,
      tapeWidthMm,
      labelLengthMm,
      params,
      measureText: measureTextNode
    });
    const errors = resolved.issues.filter(issue => issue.severity === 'error');
    if (errors.length) throw new Error(`Template does not fit: ${errors.map(issue => issue.message).join('; ')}`);
    for (const warning of resolved.issues.filter(issue => issue.severity === 'warn')) {
      process.stderr.write(`Warning: ${warning.message}\n`);
    }
    const page = await rasterizeDesign(resolved.design, nodeRasterEnv, {
      inkChannels: capabilities.colorSupport.channels ?? 1
    });
    const density = options.density ?? capabilities.maxDensity;
    if (!Number.isInteger(density) || density < 1 || density > capabilities.maxDensity) {
      throw new Error(`Density must be an integer from 1 to ${capabilities.maxDensity}.`);
    }
    await manager.print(page, { density, copies: options.copies });
    process.stdout.write(`Printed ${template.name} (${widthPx}×${heightPx}px) via ${options.transport}.\n`);
  } finally {
    await manager.disconnect();
  }
}

async function loadTemplate(path: string): Promise<LabelTemplate> {
  const input = await readFile(path);
  if (input.byteLength > MAX_TEMPLATE_BYTES) throw new Error('Template exceeds the 2 MiB CLI limit.');
  let value: unknown;
  try {
    value = JSON.parse(input.toString('utf8'));
  } catch {
    throw new Error('Template is not valid JSON.');
  }
  const parsed = parseTemplate(value);
  if (!parsed.ok) throw new Error(`Invalid ULT template: ${parsed.errors.join('; ')}`);
  return parsed.template;
}

async function createTransport(options: CliOptions): Promise<IDeviceTransport> {
  switch (options.transport) {
    case 'dummy': return new DummyTransport();
    case 'ble': return new NodeBleTransport();
    case 'usb': return new NodeUsbTransport();
    case 'serial': return new NodeSerialTransport({ path: options.serialPath, deviceName: options.serialName });
  }
}

async function connect(manager: PrintManager, transport: IDeviceTransport, options: CliOptions): Promise<void> {
  if (options.transport === 'ble') {
    if (!options.deviceId) throw new Error('BLE printing requires an exact --device-id. Use --list first.');
    await (transport as NodeBleTransport).connectByDeviceId(options.deviceId);
    await manager.connectWithTransport(transport);
    return;
  }
  await manager.connect(transport);
}

function parseArgs(args: string[]): CliOptions {
  const out: CliOptions = { help: false, list: false, transport: 'dummy', copies: 1, params: {} };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = () => {
      const next = args[++index];
      if (next === undefined || next.startsWith('--')) throw new Error(`${arg} requires a value.`);
      return next;
    };
    switch (arg) {
      case '--help': case '-h': out.help = true; break;
      case '--list': out.list = true; break;
      case '--template': out.template = value(); break;
      case '--transport': {
        const candidate = value();
        if (!['dummy', 'ble', 'usb', 'serial'].includes(candidate)) throw new Error(`Unknown transport: ${candidate}`);
        out.transport = candidate as TransportName;
        break;
      }
      case '--device-id': out.deviceId = value(); break;
      case '--serial-path': out.serialPath = value(); break;
      case '--serial-name': out.serialName = value(); break;
      case '--tape-width': out.tapeWidthMm = number(value(), '--tape-width'); break;
      case '--length': out.labelLengthMm = number(value(), '--length'); break;
      case '--density': out.density = number(value(), '--density'); break;
      case '--copies': out.copies = number(value(), '--copies'); break;
      case '--param': {
        const pair = value();
        const separator = pair.indexOf('=');
        if (separator < 1) throw new Error('--param must use name=value.');
        out.params[pair.slice(0, separator)] = pair.slice(separator + 1);
        break;
      }
      default: throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (!Number.isInteger(out.copies) || out.copies < 1 || out.copies > 100) {
    throw new Error('--copies must be an integer from 1 to 100.');
  }
  return out;
}

function coerceParams(values: Record<string, string>, schema: TemplateParam[]): Record<string, unknown> {
  const allowed = new Map(schema.map(param => [param.name, param]));
  const result: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(values)) {
    const param = allowed.get(name);
    if (!param) throw new Error(`Unknown template parameter: ${name}`);
    if (param.type === 'number') result[name] = number(value, name);
    else if (param.type === 'boolean') {
      if (value !== 'true' && value !== 'false') throw new Error(`${name} must be true or false.`);
      result[name] = value === 'true';
    } else result[name] = value;
  }
  return result;
}

function number(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a number.`);
  return parsed;
}

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be greater than zero.`);
  return value;
}

main().catch(error => {
  process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
