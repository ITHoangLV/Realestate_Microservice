import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { seedListings } from '../listing/seed/seed-listings';

/**
 * `pnpm seed:listings`: nạp 30 tin ở Hà Nội cho môi trường dev (T2.4). Id cố định, xem
 * `src/listing/seed/seed-listings.data.ts` và `guides/RE_Docker_Local_Guide.md §5`. Cần đã chạy
 * `pnpm migration:run` cho listing. Chủ trọ là 3 người dùng của `pnpm seed:users` bên identity.
 *
 *   pnpm --filter @realestate/listing seed:listings
 *
 * DATABASE_URL lấy từ môi trường hoặc file .env. Chạy lại an toàn (xem seedListings). Script độc lập,
 * KHÔNG khởi động NestJS nên không cần RabbitMQ, Redis, S3.
 */
async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env'); // không ghi đè biến đã có sẵn

  const { DATABASE_URL } = process.env;
  if (!DATABASE_URL) throw new Error('Thiếu biến môi trường: DATABASE_URL');

  const dataSource = new DataSource({ type: 'postgres', url: DATABASE_URL });
  await dataSource.initialize();
  try {
    const result = await seedListings(dataSource);
    console.log(
      `Seed tin đăng xong: tạo mới ${result.created}, đã có sẵn ${result.existing} (tổng 30 tin ở Hà Nội)`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error('Seed tin đăng thất bại:', err instanceof Error ? err.message : err);
  process.exit(1);
});
