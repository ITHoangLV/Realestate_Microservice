// Module tùy chọn chỉ bật khi có biến môi trường tương ứng.
// Đọc process.env lúc import AppModule (env đã được nạp/validate bởi env.bootstrap.ts hoặc ConfigModule).
const has = (name: string): boolean => Boolean(process.env[name]?.trim());

export const isDatabaseEnabled = (): boolean => has('DATABASE_URL');
export const isRedisEnabled = (): boolean => has('REDIS_URL');
