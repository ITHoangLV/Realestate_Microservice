// Module tùy chọn chỉ bật khi có biến môi trường tương ứng.
// Đọc process.env lúc import AppModule (env đã được nạp/validate bởi env.bootstrap.ts hoặc ConfigModule).
const has = (name: string): boolean => Boolean(process.env[name]?.trim());

export const isDatabaseEnabled = (): boolean => has('DATABASE_URL');
export const isRedisEnabled = (): boolean => has('REDIS_URL');
// RabbitMQ cần DB (outbox/inbox); env.validation.ts đã bắt buộc DATABASE_URL đi kèm RABBITMQ_URL.
export const isMessagingEnabled = (): boolean => has('RABBITMQ_URL') && isDatabaseEnabled();
export const isStorageEnabled = (): boolean => has('S3_ENDPOINT');
// identity-service: cần DB (users), RabbitMQ (publish event), Redis (refresh token) và khóa riêng để ký token.
// Ở môi trường thật, identity.env.ts bắt buộc đủ nên cờ này luôn bật; riêng NODE_ENV=test
// được bỏ qua để các test chung của template chạy không cần DB/Redis.
export const isIdentityEnabled = (): boolean =>
  isMessagingEnabled() &&
  isRedisEnabled() &&
  (has('JWT_PRIVATE_KEY') || has('JWT_PRIVATE_KEY_PATH'));
