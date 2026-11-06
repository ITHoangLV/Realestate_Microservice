// Tạo cặp khóa RSA cho JWT RS256: pnpm keys:generate (thêm --force để tạo lại).
//
//   secrets/jwt-private.pem  CHỈ identity-service đọc, dùng để KÝ token
//   secrets/jwt-public.pem   mọi service đọc (JWT_PUBLIC_KEY_PATH), dùng để KIỂM TRA token
//
// Thư mục secrets/ đã nằm trong .gitignore, khóa không bao giờ lên git.
// Mặc định KHÔNG ghi đè khóa đang có: đổi khóa làm mọi token đã phát hành mất hiệu lực.
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'secrets');
const privatePath = join(dir, 'jwt-private.pem');
const publicPath = join(dir, 'jwt-public.pem');
const force = process.argv.includes('--force');

const existing = [privatePath, publicPath].filter((p) => existsSync(p));
if (existing.length > 0 && !force) {
  console.log(`Đã có khóa: ${existing.map((p) => relative(root, p)).join(', ')}`);
  console.log(
    'Giữ nguyên. Muốn tạo lại (mọi token cũ sẽ hết hiệu lực): pnpm keys:generate --force',
  );
  process.exit(0);
}

// RSA 2048 bit: đủ an toàn cho RS256 và là mức phổ biến nhất
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

mkdirSync(dir, { recursive: true });
// mode 0o600: chỉ chủ file đọc được private key (trên Windows Node bỏ qua, không lỗi)
writeFileSync(privatePath, privateKey, { mode: 0o600 });
writeFileSync(publicPath, publicKey, { mode: 0o644 });

console.log(`Đã tạo ${relative(root, privatePath)} và ${relative(root, publicPath)}`);
