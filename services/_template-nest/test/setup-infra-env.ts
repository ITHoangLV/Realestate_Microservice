// Chạy trước mỗi file test hạ tầng (pnpm test:infra), TRƯỚC khi AppModule được import.
// Cần hạ tầng đang chạy: ở thư mục gốc repo `pnpm infra:up`.
//
// Đọc mật khẩu từ .env GỐC repo (không hard-code). Test dùng identity_db nhưng trong schema riêng
// INFRA_TEST_SCHEMA (search_path), tạo mới đầu test và xóa ở cuối, không đụng bảng của identity.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { INFRA_TEST_SCHEMA } from './helpers/infra';

const rootEnv = resolve(__dirname, '..', '..', '..', '.env');
if (!existsSync(rootEnv)) {
  throw new Error(`Không thấy ${rootEnv}. Ở thư mục gốc repo chạy: Copy-Item .env.example .env`);
}
// Chỉ ĐỌC .env gốc, không nạp vào process.env (tránh biến lạ lọt vào service đang test)
const root = parseEnv(readFileSync(rootEnv, 'utf8'));
const need = (name: string): string => {
  const v = root[name];
  if (!v) throw new Error(`Thiếu ${name} trong .env gốc`);
  return encodeURIComponent(v);
};

const databaseUrl =
  `postgres://${need('IDENTITY_DB_USER')}:${need('IDENTITY_DB_PASSWORD')}` +
  `@localhost:${need('POSTGRES_PORT')}/${need('IDENTITY_DB_NAME')}` +
  `?options=${encodeURIComponent(`-c search_path=${INFRA_TEST_SCHEMA}`)}`;
const rabbitUrl =
  `amqp://${need('RABBITMQ_USER')}:${need('RABBITMQ_PASSWORD')}` +
  `@localhost:${need('RABBITMQ_PORT')}/${encodeURIComponent(root.RABBITMQ_VHOST ?? '/')}`;

Object.assign(process.env, {
  NODE_ENV: 'test',
  SERVICE_NAME: 'template-nest-test',
  LOG_LEVEL: 'info',
  LOG_PRETTY: 'false',
  SWAGGER_ENABLED: 'false',
  DATABASE_URL: databaseUrl,
  RABBITMQ_URL: rabbitUrl,
});
for (const name of [
  'REDIS_URL',
  'JWT_PUBLIC_KEY',
  'JWT_PUBLIC_KEY_PATH',
  'JWT_SECRET',
  'JWT_ISSUER',
]) {
  delete process.env[name];
}
