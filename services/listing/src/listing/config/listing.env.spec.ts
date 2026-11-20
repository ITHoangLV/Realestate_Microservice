import { checkListingEnv, LISTING_IMAGES_BUCKET } from './listing.env';

const full = {
  DATABASE_URL: 'postgres://listing_user:x@localhost:5433/listing_db',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY: 'k',
  S3_SECRET_KEY: 's',
  S3_BUCKETS: LISTING_IMAGES_BUCKET,
  JWT_ISSUER: 'realestate-identity',
  JWT_PUBLIC_KEY_PATH: '../../secrets/jwt-public.pem',
};

describe('checkListingEnv', () => {
  it('đủ biến: không có lỗi', () => {
    expect(checkListingEnv(full)).toEqual([]);
  });

  it('chấp nhận JWT_PUBLIC_KEY thay cho JWT_PUBLIC_KEY_PATH', () => {
    const rest: Record<string, unknown> = { ...full };
    delete rest.JWT_PUBLIC_KEY_PATH;
    expect(checkListingEnv({ ...rest, JWT_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----' })).toEqual([]);
  });

  it.each(['DATABASE_URL', 'S3_ENDPOINT', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'JWT_ISSUER'])(
    'thiếu %s: báo đúng tên biến',
    (name) => {
      const env: Record<string, unknown> = { ...full };
      delete env[name];
      const errors = checkListingEnv(env);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(name);
    },
  );

  it('chuỗi rỗng hoặc toàn khoảng trắng coi như thiếu', () => {
    const errors = checkListingEnv({ ...full, DATABASE_URL: '   ', S3_ENDPOINT: '' });
    expect(errors.join('\n')).toContain('DATABASE_URL');
    expect(errors.join('\n')).toContain('S3_ENDPOINT');
  });

  it('thiếu cả JWT_PUBLIC_KEY lẫn JWT_PUBLIC_KEY_PATH: nói cần MỘT trong hai', () => {
    const rest: Record<string, unknown> = { ...full };
    delete rest.JWT_PUBLIC_KEY_PATH;
    const errors = checkListingEnv(rest);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('JWT_PUBLIC_KEY');
    expect(errors[0]).toContain('JWT_PUBLIC_KEY_PATH');
  });

  it('S3_BUCKETS không có listing-images: báo lỗi', () => {
    const errors = checkListingEnv({ ...full, S3_BUCKETS: 'bank-qr' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(LISTING_IMAGES_BUCKET);
  });

  it('S3_BUCKETS nhiều bucket, có listing-images (có khoảng trắng): hợp lệ', () => {
    expect(checkListingEnv({ ...full, S3_BUCKETS: ' bank-qr , listing-images ' })).toEqual([]);
  });

  it('không in giá trị của biến sai (có thể là khóa thật)', () => {
    const errors = checkListingEnv({ ...full, S3_BUCKETS: 'bi-mat-khong-duoc-lo' });
    expect(errors.join('\n')).not.toContain('bi-mat-khong-duoc-lo');
  });
});
