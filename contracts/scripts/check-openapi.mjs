// Kiểm tra contracts/openapi/*.yaml: OpenAPI 3.1, $ref nội bộ không gãy, ví dụ response khớp schema.
// Schema của OpenAPI 3.1 là JSON Schema 2020-12 nên kiểm tra được bằng ajv.
// Chạy: pnpm contracts:check (thoát 1 nếu có lỗi).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const specDir = join(root, 'contracts', 'openapi');

const errors = [];
const ok = (msg) => console.log(`[OK  ] ${msg}`);
const fail = (msg) => {
  errors.push(msg);
  console.log(`[FAIL] ${msg}`);
};

// Lấy node theo JSON pointer "#/a/b".
const resolve = (doc, ref) =>
  ref
    .slice(2)
    .split('/')
    .reduce(
      (node, key) => (node == null ? undefined : node[key.replace(/~1/g, '/').replace(/~0/g, '~')]),
      doc,
    );

// Đổi "#/components/schemas/X" thành id riêng để ajv tách được từng schema.
const rewriteRefs = (node, prefix) => {
  if (Array.isArray(node)) return node.map((n) => rewriteRefs(n, prefix));
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node).map(([k, v]) => [
        k,
        k === '$ref' && typeof v === 'string' && v.startsWith('#/components/schemas/')
          ? `${prefix}${v.slice('#/components/schemas/'.length)}`
          : rewriteRefs(v, prefix),
      ]),
    );
  }
  return node;
};

const files = readdirSync(specDir).filter((f) => /\.ya?ml$/.test(f));
if (files.length === 0) fail('contracts/openapi: không có file spec nào');

for (const file of files) {
  let doc;
  try {
    doc = parse(readFileSync(join(specDir, file), 'utf8'));
  } catch (e) {
    fail(`${file}: YAML lỗi: ${e.message}`);
    continue;
  }
  if (!/^3\.1\./.test(String(doc.openapi)))
    fail(`${file}: phải là OpenAPI 3.1.x (đang là ${doc.openapi})`);
  if (!doc.info?.title || !doc.info?.version) fail(`${file}: thiếu info.title hoặc info.version`);

  // Mọi $ref nội bộ phải trỏ tới node tồn tại.
  const refs = [...JSON.stringify(doc).matchAll(/"\$ref":"([^"]+)"/g)].map((m) => m[1]);
  for (const ref of new Set(refs)) {
    if (!ref.startsWith('#/')) fail(`${file}: $ref ngoài file không được hỗ trợ: ${ref}`);
    else if (resolve(doc, ref) === undefined) fail(`${file}: $ref gãy: ${ref}`);
  }

  // Nạp components.schemas vào ajv riêng cho file này.
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false });
  addFormats(ajv);
  const prefix = `https://realestate.local/contracts/openapi/${file}/schemas/`;
  for (const [name, schema] of Object.entries(doc.components?.schemas ?? {})) {
    ajv.addSchema(rewriteRefs(schema, prefix), `${prefix}${name}`);
  }

  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    if (!path.startsWith('/internal/')) fail(`${file}: ${path} phải có prefix /internal/`);
    for (const [method, op] of Object.entries(item)) {
      if (!op?.responses) continue;
      if (!op.operationId) fail(`${file}: ${method.toUpperCase()} ${path} thiếu operationId`);
      for (const [status, res] of Object.entries(op.responses)) {
        const media = res.content?.['application/json'];
        const label = `${file}: ${method.toUpperCase()} ${path} ${status}`;
        if (!media) continue;
        if (media.example === undefined) {
          fail(`${label}: thiếu example`);
          continue;
        }
        try {
          const validate = ajv.compile(rewriteRefs(media.schema, prefix));
          if (validate(media.example)) ok(`${label}: example khớp schema`);
          else fail(`${label}: example không khớp: ${ajv.errorsText(validate.errors)}`);
        } catch (e) {
          fail(`${label}: schema không compile được: ${e.message}`);
        }
      }
    }
  }
}

console.log(
  errors.length === 0
    ? `\nKẾT QUẢ: ${files.length} spec, tất cả OK`
    : `\nKẾT QUẢ: ${errors.length} lỗi`,
);
process.exit(errors.length === 0 ? 0 : 1);
