import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { connect as connectMqtt, type MqttClient } from 'mqtt';
import { PrintManager, type IDeviceTransport } from 'universal-label-core';
import { DummyTransport } from 'universal-label-core/transport/dummy';
import { NodeBleTransport } from 'universal-label-core/transport/node';
import { NodeSerialTransport } from 'universal-label-core/transport/node-serial';
import { NodeUsbTransport } from 'universal-label-core/transport/node-usb';
import { rasterizeDesign, resolveTemplate, type TemplateParam } from 'universal-label-renderer';
import { measureTextNode, nodeRasterEnv } from './node-raster.js';
import { loadTemplateById } from './template-loader.js';

const MAX_JOB_BYTES = 256 * 1024;
type TransportName = 'dummy' | 'ble' | 'usb' | 'serial';

interface Config {
  brokerUrl: string;
  topicPrefix: string;
  username?: string;
  password?: string;
  templateDir: string;
  transport: TransportName;
  deviceId?: string;
  serialPath?: string;
  serialName?: string;
}

interface PrintJob {
  jobId?: string;
  templateId: string;
  params: Record<string, unknown>;
  tapeWidthMm?: number;
  labelLengthMm?: number;
  density?: number;
  copies: number;
}

interface StatusMessage {
  state: 'accepted' | 'printing' | 'completed' | 'failed';
  jobId?: string;
  templateId?: string;
  error?: string;
}

const HELP = `BleWebler2 MQTT service

Subscribe to validated ULT print jobs and send them to a configured local printer.
Configuration is read from environment variables; see apps/mqtt-client/.env.example.

Usage:
  npm run mqtt
  npm run mqtt -- --check

Options:
  --check    validate configuration without connecting
  --help     show this help
`;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(HELP);
  process.exit(0);
}
const unknownArgs = args.filter(arg => arg !== '--check');
if (unknownArgs.length > 0) {
  process.stderr.write(`Error: Unknown option: ${unknownArgs[0]}. Run with --help for usage.\n`);
  process.exit(1);
}

const config = readConfig();
if (args.includes('--check')) {
  process.stdout.write(
    `Configuration valid; templates=${config.templateDir}; transport=${config.transport}; topic=${config.topicPrefix}/print.\n`
  );
  process.exit(0);
}
const printTopic = `${config.topicPrefix}/print`;
const statusTopic = `${config.topicPrefix}/status`;
const client = connectMqtt(config.brokerUrl, {
  clientId: `blewebler2-${randomBytes(6).toString('hex')}`,
  clean: true,
  username: config.username,
  password: config.password,
  reconnectPeriod: 2_000,
  connectTimeout: 10_000
});

let queue = Promise.resolve();

client.on('connect', () => {
  client.subscribe(printTopic, { qos: 1 }, error => {
    if (error) {
      process.stderr.write(`MQTT subscription failed: ${error.message}\n`);
      return;
    }
    process.stdout.write(`Listening on ${printTopic}; transport=${config.transport}.\n`);
  });
});

client.on('message', (topic, payload) => {
  if (topic !== printTopic) return;
  if (payload.byteLength > MAX_JOB_BYTES) {
    publishStatus(client, { state: 'failed', error: 'Job exceeds the 256 KiB payload limit.' });
    return;
  }
  queue = queue.then(async () => {
    let job: PrintJob;
    try {
      job = parseJob(payload);
      publishStatus(client, { state: 'accepted', jobId: job.jobId, templateId: job.templateId });
      await printJob(job);
      publishStatus(client, { state: 'completed', jobId: job.jobId, templateId: job.templateId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Print job failed: ${message}\n`);
      publishStatus(client, { state: 'failed', error: message });
    }
  });
});

client.on('error', error => process.stderr.write(`MQTT error: ${error.message}\n`));

async function printJob(job: PrintJob): Promise<void> {
  const template = await loadTemplateById(config.templateDir, job.templateId);
  validateParams(job.params, template.params);
  const manager = new PrintManager();
  const transport = createTransport(config);
  await connectPrinter(manager, transport, config);
  try {
    publishStatus(client, { state: 'printing', jobId: job.jobId, templateId: job.templateId });
    const capabilities = manager.getCapabilities();
    const tapeWidthMm = positive(job.tapeWidthMm ?? template.adaptivity.designedFor.tapeWidthMm, 'tapeWidthMm');
    const labelLengthMm = positive(
      job.labelLengthMm ?? template.adaptivity.designedFor.labelLengthMm ?? 40,
      'labelLengthMm'
    );
    const heightPx = capabilities.canvasHeightPx;
    const widthPx = Math.max(1, Math.round(labelLengthMm * capabilities.dpmm));
    const resolved = resolveTemplate(template, {
      widthPx,
      heightPx,
      tapeWidthMm,
      labelLengthMm,
      params: job.params,
      measureText: measureTextNode
    });
    const errors = resolved.issues.filter(issue => issue.severity === 'error');
    if (errors.length) throw new Error(`Template does not fit: ${errors.map(issue => issue.message).join('; ')}`);
    const page = await rasterizeDesign(resolved.design, nodeRasterEnv, {
      inkChannels: capabilities.colorSupport.channels ?? 1
    });
    const density = job.density ?? capabilities.maxDensity;
    if (!Number.isInteger(density) || density < 1 || density > capabilities.maxDensity) {
      throw new Error(`density must be an integer from 1 to ${capabilities.maxDensity}.`);
    }
    await manager.print(page, { density, copies: job.copies });
  } finally {
    await manager.disconnect();
  }
}

function parseJob(payload: Buffer): PrintJob {
  let value: unknown;
  try {
    value = JSON.parse(payload.toString('utf8'));
  } catch {
    throw new Error('Job is not valid JSON.');
  }
  if (!isRecord(value)) throw new Error('Job must be a JSON object.');
  if (typeof value.templateId !== 'string') throw new Error('templateId is required.');
  const params = value.params === undefined ? {} : value.params;
  if (!isRecord(params) || Object.keys(params).length > 60) throw new Error('params must be an object with at most 60 entries.');
  const copies = optionalNumber(value.copies, 'copies') ?? 1;
  if (!Number.isInteger(copies) || copies < 1 || copies > 100) throw new Error('copies must be an integer from 1 to 100.');
  const jobId = value.jobId === undefined ? undefined : boundedString(value.jobId, 'jobId', 128);
  return {
    jobId,
    templateId: value.templateId,
    params,
    tapeWidthMm: optionalNumber(value.tapeWidthMm, 'tapeWidthMm'),
    labelLengthMm: optionalNumber(value.labelLengthMm, 'labelLengthMm'),
    density: optionalNumber(value.density, 'density'),
    copies
  };
}

function validateParams(values: Record<string, unknown>, schema: TemplateParam[]): void {
  const allowed = new Map(schema.map(param => [param.name, param]));
  for (const [name, value] of Object.entries(values)) {
    const param = allowed.get(name);
    if (!param) throw new Error(`Unknown template parameter: ${name}`);
    if (param.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
      throw new Error(`${name} must be a finite number.`);
    }
    if (param.type === 'boolean' && typeof value !== 'boolean') throw new Error(`${name} must be a boolean.`);
    if (param.type !== 'number' && param.type !== 'boolean' && typeof value !== 'string') {
      throw new Error(`${name} must be a string.`);
    }
    if (typeof value === 'string' && value.length > 10_000) throw new Error(`${name} is too long.`);
  }
}

function createTransport(options: Config): IDeviceTransport {
  switch (options.transport) {
    case 'dummy': return new DummyTransport();
    case 'ble': return new NodeBleTransport();
    case 'usb': return new NodeUsbTransport();
    case 'serial': return new NodeSerialTransport({ path: options.serialPath, deviceName: options.serialName });
  }
}

async function connectPrinter(manager: PrintManager, transport: IDeviceTransport, options: Config): Promise<void> {
  if (options.transport === 'ble') {
    if (!options.deviceId) throw new Error('BLE transport requires BLEWEBLER2_DEVICE_ID.');
    await (transport as NodeBleTransport).connectByDeviceId(options.deviceId);
    await manager.connectWithTransport(transport);
    return;
  }
  await manager.connect(transport);
}

function readConfig(): Config {
  const transport = process.env.BLEWEBLER2_TRANSPORT ?? 'dummy';
  if (!['dummy', 'ble', 'usb', 'serial'].includes(transport)) throw new Error(`Invalid BLEWEBLER2_TRANSPORT: ${transport}`);
  const prefix = (process.env.BLEWEBLER2_MQTT_TOPIC_PREFIX ?? 'blewebler2').replace(/^\/+|\/+$/g, '');
  if (!prefix || prefix.includes('+') || prefix.includes('#') || prefix.length > 128) {
    throw new Error('BLEWEBLER2_MQTT_TOPIC_PREFIX must be a non-wildcard MQTT topic prefix.');
  }
  const launchDirectory = process.env.INIT_CWD ?? process.cwd();
  const configuredTemplateDirectory = process.env.BLEWEBLER2_TEMPLATE_DIR;
  return {
    brokerUrl: process.env.BLEWEBLER2_MQTT_URL ?? 'mqtt://127.0.0.1:1883',
    topicPrefix: prefix,
    username: process.env.BLEWEBLER2_MQTT_USERNAME,
    password: process.env.BLEWEBLER2_MQTT_PASSWORD,
    templateDir: configuredTemplateDirectory
      ? resolve(launchDirectory, configuredTemplateDirectory)
      : resolve(import.meta.dirname, '../../../packages/ult/examples'),
    transport: transport as TransportName,
    deviceId: process.env.BLEWEBLER2_DEVICE_ID,
    serialPath: process.env.BLEWEBLER2_SERIAL_PATH,
    serialName: process.env.BLEWEBLER2_SERIAL_NAME
  };
}

function publishStatus(mqtt: MqttClient, status: StatusMessage): void {
  mqtt.publish(statusTopic, JSON.stringify(status), { qos: 1, retain: false });
}

function optionalNumber(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} must be a finite number.`);
  return value;
}

function boundedString(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || value.length > max) throw new Error(`${name} must be a string of at most ${max} characters.`);
  return value;
}

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be greater than zero.`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function shutdown(signal: string): Promise<void> {
  process.stdout.write(`Received ${signal}; closing MQTT connection.\n`);
  await new Promise<void>((resolveEnd, reject) => {
    client.end(false, {}, error => error ? reject(error) : resolveEnd());
  });
  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
