// Kiểm tra contracts/events: schema hợp lệ, ví dụ khớp schema, và khớp topology RabbitMQ.
// Chạy: pnpm contracts:check (thoát 1 nếu có lỗi).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const eventsDir = join(root, 'contracts', 'events');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

const errors = [];
const ok = (msg) => console.log(`[OK  ] ${msg}`);
const fail = (msg) => {
  errors.push(msg);
  console.log(`[FAIL] ${msg}`);
};

const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false });
ajv.addKeyword('x-producer');
addFormats(ajv);

const envelope = readJson(join(eventsDir, 'envelope.v1.schema.json'));
ajv.addSchema(envelope);

// 1. Mỗi file schema: tên file khớp eventType và version, compile được, ví dụ hợp lệ.
const schemaFiles = readdirSync(eventsDir).filter(
  (f) => f.endsWith('.schema.json') && !f.startsWith('envelope.'),
);
const eventTypes = [];
for (const file of schemaFiles) {
  const m = /^([a-z]+\.[a-z-]+)\.v(\d+)\.schema\.json$/.exec(file);
  if (!m) {
    fail(`${file}: tên file phải có dạng <miền>.<sự kiện>.v<số>.schema.json`);
    continue;
  }
  const [, type, ver] = m;
  const schema = readJson(join(eventsDir, file));
  if (
    schema.properties?.eventType?.const !== type ||
    schema.properties?.version?.const !== Number(ver)
  ) {
    fail(`${file}: eventType/version trong schema không khớp tên file`);
    continue;
  }
  let validate;
  try {
    validate = ajv.compile(schema);
  } catch (e) {
    fail(`${file}: schema không compile được: ${e.message}`);
    continue;
  }
  eventTypes.push(type);

  const exampleFile = join(eventsDir, 'examples', `${type}.v${ver}.json`);
  let example;
  try {
    example = readJson(exampleFile);
  } catch {
    fail(`${type}.v${ver}: thiếu ví dụ examples/${type}.v${ver}.json`);
    continue;
  }
  if (validate(example)) ok(`${type}.v${ver}: ví dụ hợp lệ`);
  else fail(`${type}.v${ver}: ví dụ không hợp lệ: ${ajv.errorsText(validate.errors)}`);

  // Schema phải đủ chặt: thiếu trường bắt buộc hoặc thừa trường lạ đều bị từ chối.
  const required = schema.properties.payload.required ?? [];
  if (required.length > 0) {
    const missing = structuredClone(example);
    delete missing.payload[required[0]];
    if (validate(missing)) fail(`${type}.v${ver}: thiếu "${required[0]}" mà schema vẫn chấp nhận`);
  }
  const extra = structuredClone(example);
  extra.payload.__unknown = 1;
  if (validate(extra)) fail(`${type}.v${ver}: payload có trường lạ mà schema vẫn chấp nhận`);
}

// 2. Khớp với topology RabbitMQ.
const defs = readJson(join(root, 'infra', 'rabbitmq', 'definitions.json'));
const bindings = defs.bindings.filter((b) => b.source === 'domain.events');
const matches = (pattern, type) => {
  const [pd, pe] = pattern.split('.');
  const [td, te] = type.split('.');
  return (pd === '*' || pd === td) && (pe === '*' || pe === te);
};
// Routing key cụ thể (không wildcard) phải có schema.
for (const b of bindings) {
  if (!b.routing_key.includes('*') && !eventTypes.includes(b.routing_key)) {
    fail(`binding ${b.destination} <- ${b.routing_key}: chưa có schema cho event này`);
  }
}
// Mỗi event phải có ít nhất một queue nhận, nếu không thì phát ra cũng không ai nghe.
for (const type of eventTypes) {
  const queues = bindings.filter((b) => matches(b.routing_key, type)).map((b) => b.destination);
  if (queues.length === 0) fail(`${type}: không queue nào nhận event này`);
  else ok(`${type} -> ${[...new Set(queues)].join(', ')}`);
}

console.log(
  errors.length === 0
    ? `\nKẾT QUẢ: ${eventTypes.length} event, tất cả OK`
    : `\nKẾT QUẢ: ${errors.length} lỗi`,
);
process.exit(errors.length === 0 ? 0 : 1);
