#!/usr/bin/env node
'use strict';

// Playbook TDD — hook PostToolUse cho Claude Code (Real-estate).
//
// Sau khi Claude Write/Edit một file .ts trong services/<service>/src/, kiểm tra đã có
// file test cạnh nó chưa. Chưa có thì nhắc hoặc chặn theo
// `.claude/playbooks.json → playbooks.tdd.enforcement` (monitor-only | warn | block).
//
// Vào: JSON trên stdin { tool_name, tool_input: { file_path }, cwd, ... }
// Ra:  exit 0 = cho qua; warn in JSON additionalContext để Claude đọc được;
//      exit 2 + stderr = block, Claude nhận stderr để tự sửa.
// Mọi lỗi nội bộ → exit 0 (không làm vỡ luồng công cụ).

const fs = require('fs');
const path = require('path');

// File code nằm trong src/ của một service (gồm api-gateway và _template-nest).
const WORKSPACE_SRC = /(^|\/)services\/[^/]+\/src\//;

// File không cần test đơn vị riêng (xem tdd-guide.md §4).
const EXEMPT = [
  /\.spec\.ts$/, /\.test\.ts$/, /\.d\.ts$/,
  /\.module\.ts$/, /\.dto\.ts$/, /\.entity\.ts$/, /\.controller\.ts$/, /\.errors\.ts$/,
  /\/(main|index|app\.setup|swagger\.setup|data-source)\.ts$/,
  /\/migrations\//, /\/config\//, /\/scripts\//, /\/seed\//, /\/__tests__\//,
];

function norm(p) {
  return String(p || '').replace(/\\/g, '/');
}

function needsTest(filePath) {
  const s = norm(filePath);
  if (!s.endsWith('.ts')) return false;
  if (!WORKSPACE_SRC.test(s)) return false;
  return !EXEMPT.some((re) => re.test(s));
}

function testCandidates(absFile) {
  const dir = path.dirname(absFile);
  const base = path.basename(absFile, '.ts');
  const names = [`${base}.spec.ts`, `${base}.test.ts`, `${base}.e2e-spec.ts`, `${base}.infra-spec.ts`];
  const dirs = [dir, path.join(dir, '__tests__')];
  // Thư mục test/ song song với src/ của service (kiểu e2e của NestJS và template).
  const s = norm(dir);
  const m = s.match(/^(.*\/)src(\/.*)?$/);
  if (m) {
    dirs.push(path.join(m[1], 'test', m[2] || ''));
    dirs.push(path.join(m[1], 'test'));
  }
  const out = [];
  for (const d of dirs) for (const n of names) out.push(path.join(d, n));
  return out;
}

function hasTest(absFile) {
  return testCandidates(absFile).some((c) => {
    try { return fs.existsSync(c); } catch { return false; }
  });
}

function projectRoot(input) {
  return process.env.CLAUDE_PROJECT_DIR || input.cwd || path.resolve(__dirname, '..', '..', '..');
}

function readConfig(root) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'playbooks.json'), 'utf8'));
    const tdd = (cfg.playbooks && cfg.playbooks.tdd) || {};
    return { enabled: tdd.enabled === true, enforcement: tdd.enforcement || 'warn' };
  } catch {
    return { enabled: false, enforcement: 'warn' };
  }
}

function log(root, record) {
  try {
    const dir = path.join(root, '.claude', 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'playbook-tdd.jsonl'), JSON.stringify(record) + '\n');
  } catch { /* bỏ qua */ }
}

function message(file, mode) {
  return (
    `TDD [${mode}]: vừa sửa "${file}" nhưng chưa có file test cạnh nó (<tên>.spec.ts). ` +
    'Viết test trước theo Red → Green → Refactor. ' +
    'Xem project-knowledge/playbooks/tdd/tdd-guide.md.'
  );
}

const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('error', () => process.exit(0));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!['Write', 'Edit', 'MultiEdit'].includes(input.tool_name)) process.exit(0);

    const filePath = (input.tool_input && input.tool_input.file_path) || '';
    if (!filePath) process.exit(0);

    const root = projectRoot(input);
    const abs = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
    const rel = norm(path.relative(root, abs));
    if (!needsTest(rel)) process.exit(0);

    const { enabled, enforcement } = readConfig(root);
    if (!enabled || hasTest(abs)) process.exit(0);

    log(root, { ts: new Date().toISOString(), playbook: 'tdd', enforcement, tool: input.tool_name, file: rel, compliant: false });

    if (enforcement === 'monitor-only') process.exit(0);
    if (enforcement === 'block') {
      process.stderr.write(message(rel, 'block') + '\n');
      process.exit(2);
    }
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: message(rel, 'warn') },
    }));
    process.exit(0);
  } catch {
    process.exit(0);
  }
});
