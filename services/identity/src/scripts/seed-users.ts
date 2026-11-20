import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { seedUsers, SeedUsersError } from '../identity/seed/seed-users';

/**
 * `pnpm seed:users`: nạp 3 chủ trọ và 5 người thuê cho môi trường dev (T2.4). Id cố định, xem
 * `src/identity/seed/seed-users.data.ts` và `guides/RE_Docker_Local_Guide.md §5`. Mật khẩu đọc từ biến môi
 * trường lúc chạy, KHÔNG ghi vào file .env:
 *
 *   SEED_USER_PASSWORD='mat-khau-dai-12+' pnpm seed:users
 *   (PowerShell: $env:SEED_USER_PASSWORD='...'; pnpm seed:users)
 *
 * DATABASE_URL lấy từ môi trường hoặc file .env. Chạy lại an toàn (xem seedUsers). Event
 * identity.registered được gửi đi khi service identity chạy.
 *
 * Đây là script độc lập, KHÔNG khởi động NestJS nên không cần RabbitMQ/Redis.
 */
async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env'); // không ghi đè biến đã có sẵn

  const { SEED_USER_PASSWORD, DATABASE_URL } = process.env;
  const missing = [
    ['SEED_USER_PASSWORD', SEED_USER_PASSWORD],
    ['DATABASE_URL', DATABASE_URL],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new SeedUsersError(`Thiếu biến môi trường: ${missing.join(', ')}`);
  }

  const dataSource = new DataSource({ type: 'postgres', url: DATABASE_URL });
  await dataSource.initialize();
  try {
    const result = await seedUsers(dataSource, { password: SEED_USER_PASSWORD as string });
    console.log(
      `Seed người dùng xong: tạo mới ${result.created}, đã có sẵn ${result.existing} (tổng 8: 3 chủ trọ, 5 người thuê)`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err: unknown) => {
  if (err instanceof SeedUsersError) {
    console.error(`Không nạp được người dùng seed: ${err.message}`);
  } else {
    console.error('Seed người dùng thất bại:', err instanceof Error ? err.message : err);
  }
  process.exit(1);
});
