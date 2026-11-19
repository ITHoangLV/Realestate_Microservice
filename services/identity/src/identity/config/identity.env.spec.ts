import { randomBytes } from 'node:crypto';
import { checkIdentityEnv } from './identity.env';

const VALID_KEY = randomBytes(32).toString('base64');
const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5433/identity_db',
  RABBITMQ_URL: 'amqp://u:p@localhost:5672/%2F',
  REDIS_URL: 'redis://:p@localhost:6379',
  JWT_ISSUER: 'realestate-identity',
  JWT_PRIVATE_KEY_PATH: '../../secrets/jwt-private.pem',
  JWT_PUBLIC_KEY_PATH: '../../secrets/jwt-public.pem',
  BANK_ACCOUNT_ENCRYPTION_KEY: VALID_KEY,
};

describe('checkIdentityEnv: BANK_ACCOUNT_ENCRYPTION_KEY', () => {
  it('đủ cấu hình, khóa base64 đúng 32 byte -> không lỗi', () => {
    expect(checkIdentityEnv(base)).toEqual([]);
  });

  it.each([
    ['không có', undefined],
    ['chuỗi rỗng (compose để trống)', ''],
    ['chỉ có khoảng trắng', '   '],
  ])('khóa %s -> báo THIẾU', (_name, value) => {
    const env: Record<string, unknown> = { ...base, BANK_ACCOUNT_ENCRYPTION_KEY: value };
    if (value === undefined) delete env.BANK_ACCOUNT_ENCRYPTION_KEY;
    const errors = checkIdentityEnv(env);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('BANK_ACCOUNT_ENCRYPTION_KEY');
    expect(errors[0]).toContain('THIẾU');
  });

  it.each([
    ['16 byte', randomBytes(16).toString('base64')],
    ['33 byte', randomBytes(33).toString('base64')],
    ['không phải base64', 'khong-phai-base64-!!!-khong-phai-base64'],
  ])('khóa %s -> báo sai định dạng 32 byte, KHÔNG in giá trị khóa', (_name, value) => {
    const errors = checkIdentityEnv({ ...base, BANK_ACCOUNT_ENCRYPTION_KEY: value });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('BANK_ACCOUNT_ENCRYPTION_KEY');
    expect(errors[0]).toContain('32 byte');
    expect(errors[0]).not.toContain('THIẾU');
    expect(errors.join('\n')).not.toContain(value);
  });
});
