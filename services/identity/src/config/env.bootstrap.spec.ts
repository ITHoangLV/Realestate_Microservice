import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Chạy env.bootstrap.ts như một tiến trình riêng (giống lúc `node dist/main.js` khởi động) để
 * chứng minh: thiếu/sai biến thì tiến trình DỪNG NGAY với mã 1 và thông báo rõ, không in stack.
 */
const bootstrap = resolve(__dirname, 'env.bootstrap.ts');
const tsconfig = resolve(__dirname, '../../tsconfig.json');
const tsNode = require.resolve('ts-node/register/transpile-only');

function run(env: Record<string, string>) {
  const cwd = mkdtempSync(join(tmpdir(), 'bootstrap-')); // thư mục trống: không có file .env
  const baseEnv = { ...process.env } as Record<string, string | undefined>;
  for (const key of Object.keys(baseEnv)) {
    if (
      /^(SERVICE_NAME|PORT|LOG_LEVEL|REDIS_URL|DATABASE_URL|JWT_.*|HTTP_.*|NODE_ENV|BANK_ACCOUNT_ENCRYPTION_KEY|SMTP_.*|MAIL_FROM|GOOGLE_CLIENT_ID|OTP_.*|PASSWORD_RESET_.*)$/.test(
        key,
      )
    ) {
      delete baseEnv[key];
    }
  }
  try {
    return spawnSync(process.execPath, ['-r', tsNode, bootstrap], {
      cwd,
      env: { ...baseEnv, TS_NODE_PROJECT: tsconfig, ...env },
      encoding: 'utf8',
      timeout: 60_000,
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

describe('env.bootstrap (khởi động tiến trình)', () => {
  it('thiếu SERVICE_NAME -> thoát mã 1 và báo rõ thiếu biến nào, không in stack trace', () => {
    const r = run({});
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Cấu hình môi trường không hợp lệ');
    expect(r.stderr).toContain('SERVICE_NAME: THIẾU (bắt buộc)');
    expect(r.stderr).not.toMatch(/\n\s+at /);
  });

  it('nhiều biến sai -> liệt kê hết, vẫn thoát mã 1', () => {
    const r = run({ SERVICE_NAME: 'x', PORT: 'abc', REDIS_URL: 'http://sai' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('PORT');
    expect(r.stderr).toContain('REDIS_URL');
  });

  it('NODE_ENV=test bỏ qua phần bắt buộc riêng của identity -> thoát mã 0, không in lỗi', () => {
    const r = run({ SERVICE_NAME: 'x', NODE_ENV: 'test' });
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
  });

  it('identity thiếu DB/Redis/RabbitMQ/khóa JWT -> thoát mã 1 và liệt kê từng thứ thiếu', () => {
    const r = run({ SERVICE_NAME: 'identity' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Thiếu cấu hình của identity-service');
    for (const name of ['DATABASE_URL', 'RABBITMQ_URL', 'REDIS_URL', 'JWT_ISSUER']) {
      expect(r.stderr).toContain(name);
    }
    expect(r.stderr).toContain('JWT_PRIVATE_KEY');
    expect(r.stderr).toContain('JWT_PUBLIC_KEY');
    expect(r.stderr).toContain('BANK_ACCOUNT_ENCRYPTION_KEY');
  });

  it('identity đủ cấu hình -> thoát mã 0', () => {
    const r = run({
      SERVICE_NAME: 'identity',
      DATABASE_URL: 'postgres://u:p@localhost:5433/identity_db',
      RABBITMQ_URL: 'amqp://u:p@localhost:5672/%2F',
      REDIS_URL: 'redis://:p@localhost:6379',
      JWT_ISSUER: 'realestate-identity',
      JWT_PRIVATE_KEY_PATH: '../../secrets/jwt-private.pem',
      JWT_PUBLIC_KEY_PATH: '../../secrets/jwt-public.pem',
      BANK_ACCOUNT_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      SMTP_HOST: 'localhost',
      MAIL_FROM: 'no-reply@realestate.local',
    });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('identity thiếu SMTP_HOST và MAIL_FROM -> thoát mã 1, liệt kê cả hai (GOOGLE_CLIENT_ID không bắt buộc)', () => {
    const r = run({
      SERVICE_NAME: 'identity',
      DATABASE_URL: 'postgres://u:p@localhost:5433/identity_db',
      RABBITMQ_URL: 'amqp://u:p@localhost:5672/%2F',
      REDIS_URL: 'redis://:p@localhost:6379',
      JWT_ISSUER: 'realestate-identity',
      JWT_PRIVATE_KEY_PATH: '../../secrets/jwt-private.pem',
      JWT_PUBLIC_KEY_PATH: '../../secrets/jwt-public.pem',
      BANK_ACCOUNT_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('SMTP_HOST');
    expect(r.stderr).toContain('MAIL_FROM');
    expect(r.stderr).not.toContain('GOOGLE_CLIENT_ID');
  });

  it('identity có khóa mã hóa sai độ dài -> thoát mã 1, nói rõ cần 32 byte, không in giá trị khóa', () => {
    const badKey = randomBytes(16).toString('base64');
    const r = run({
      SERVICE_NAME: 'identity',
      DATABASE_URL: 'postgres://u:p@localhost:5433/identity_db',
      RABBITMQ_URL: 'amqp://u:p@localhost:5672/%2F',
      REDIS_URL: 'redis://:p@localhost:6379',
      JWT_ISSUER: 'realestate-identity',
      JWT_PRIVATE_KEY_PATH: '../../secrets/jwt-private.pem',
      JWT_PUBLIC_KEY_PATH: '../../secrets/jwt-public.pem',
      BANK_ACCOUNT_ENCRYPTION_KEY: badKey,
      SMTP_HOST: 'localhost',
      MAIL_FROM: 'no-reply@realestate.local',
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('BANK_ACCOUNT_ENCRYPTION_KEY');
    expect(r.stderr).toContain('32 byte');
    expect(r.stderr).not.toContain(badKey);
  });
});
