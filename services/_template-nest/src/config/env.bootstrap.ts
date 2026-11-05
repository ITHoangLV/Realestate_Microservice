// PHẢI là import đầu tiên của main.ts (import có tác dụng phụ):
// 1) nạp .env (không ghi đè biến đã có sẵn trong môi trường, ví dụ biến do Docker truyền vào)
// 2) validate; sai thì in thông báo rõ ràng rồi thoát mã 1, KHÔNG in stack dài dòng.
// Lý do tách riêng: AppModule quyết định bật module DB/Redis dựa trên process.env ngay lúc import,
// nên env phải đầy đủ và hợp lệ TRƯỚC khi AppModule được nạp.
import { existsSync } from 'node:fs';
import { envSchema, formatEnvErrors } from './env.validation';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const { error } = envSchema.validate(process.env, { abortEarly: false, allowUnknown: true });
if (error) {
  console.error(formatEnvErrors(error));
  console.error('Sửa file .env (tham khảo .env.example) rồi chạy lại.');
  process.exit(1);
}
