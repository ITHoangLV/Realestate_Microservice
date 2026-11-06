import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { seedAdmin, SeedAdminError } from '../identity/seed-admin';

/**
 * `pnpm seed:admin`: tạo tài khoản ADMIN đầu tiên. Đọc cấu hình từ biến môi trường (lúc chạy,
 * KHÔNG ghi mật khẩu vào file .env):
 *
 *   SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD='mat-khau-dai-12+' pnpm seed:admin
 *   (PowerShell: $env:SEED_ADMIN_EMAIL='...'; $env:SEED_ADMIN_PASSWORD='...'; pnpm seed:admin)
 *
 * SEED_ADMIN_NAME (tùy chọn) là tên hiển thị. DATABASE_URL lấy từ môi trường hoặc file .env.
 * Chạy lại an toàn (xem seedAdmin). Event identity.registered được gửi đi khi service identity chạy.
 *
 * Đây là script độc lập, KHÔNG khởi động NestJS nên không cần RabbitMQ/Redis.
 */
async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env'); // không ghi đè biến đã có sẵn

  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME, DATABASE_URL } = process.env;
  const missing = [
    ['SEED_ADMIN_EMAIL', SEED_ADMIN_EMAIL],
    ['SEED_ADMIN_PASSWORD', SEED_ADMIN_PASSWORD],
    ['DATABASE_URL', DATABASE_URL],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new SeedAdminError(`Thiếu biến môi trường: ${missing.join(', ')}`);
  }

  const dataSource = new DataSource({ type: 'postgres', url: DATABASE_URL });
  await dataSource.initialize();
  try {
    const result = await seedAdmin(dataSource, {
      email: SEED_ADMIN_EMAIL as string,
      password: SEED_ADMIN_PASSWORD as string,
      fullName: SEED_ADMIN_NAME,
    });
    console.log(
      result.status === 'created'
        ? `Đã tạo ADMIN ${SEED_ADMIN_EMAIL} (id ${result.userId})`
        : `ADMIN ${SEED_ADMIN_EMAIL} đã tồn tại (id ${result.userId}), không thay đổi gì`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err: unknown) => {
  if (err instanceof SeedAdminError) {
    console.error(`Không tạo được ADMIN: ${err.message}`);
  } else {
    console.error('Seed ADMIN thất bại:', err instanceof Error ? err.message : err);
  }
  process.exit(1);
});
