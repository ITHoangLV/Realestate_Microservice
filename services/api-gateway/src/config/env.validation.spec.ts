import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  it('thiếu SERVICE_NAME -> ném lỗi nói rõ biến nào thiếu', () => {
    expect(() => validateEnv({})).toThrow(/SERVICE_NAME: THIẾU \(bắt buộc\)/);
  });

  it('liệt kê TẤT CẢ biến sai một lượt, không dừng ở biến đầu tiên', () => {
    let message = '';
    try {
      validateEnv({ PORT: 'abc', LOG_LEVEL: 'ồn ào', REDIS_URL: 'http://sai', JWT_SECRET: 'ngan' });
    } catch (e) {
      message = (e as Error).message;
    }
    for (const name of ['SERVICE_NAME', 'PORT', 'LOG_LEVEL', 'REDIS_URL', 'JWT_SECRET']) {
      expect(message).toContain(name);
    }
  });

  it('áp mặc định đúng cho biến không bắt buộc', () => {
    expect(validateEnv({ SERVICE_NAME: 'identity' })).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      LOG_PRETTY: false,
      HTTP_TIMEOUT_MS: 3000,
      HTTP_MAX_RETRIES: 2,
      SWAGGER_ENABLED: true,
      IDEMPOTENCY_TTL_SECONDS: 86400,
    });
  });

  it('biến tùy chọn để trống được coi như không đặt (module tương ứng tắt)', () => {
    const env = validateEnv({ SERVICE_NAME: 'x', DATABASE_URL: '', REDIS_URL: '   ' });
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.REDIS_URL).toBeUndefined();
  });

  it('chấp nhận URL hợp lệ và từ chối sai scheme', () => {
    const ok = validateEnv({
      SERVICE_NAME: 'x',
      DATABASE_URL: 'postgres://u:p@localhost:5433/db',
      REDIS_URL: 'redis://:pw@localhost:6379',
      RABBITMQ_URL: 'amqp://u:p@localhost:5672/%2F',
    });
    expect(ok.DATABASE_URL).toContain('postgres://');
    expect(() => validateEnv({ SERVICE_NAME: 'x', DATABASE_URL: 'mysql://u@h/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('RABBITMQ_URL bắt buộc đi kèm DATABASE_URL (outbox/inbox nằm trong DB)', () => {
    expect(() => validateEnv({ SERVICE_NAME: 'x', RABBITMQ_URL: 'amqp://u:p@h:5672/%2F' })).toThrow(
      /DATABASE_URL: THIẾU \(bắt buộc khi có RABBITMQ_URL\)/,
    );
    const env = validateEnv({
      SERVICE_NAME: 'x',
      RABBITMQ_URL: 'amqp://u:p@h:5672/%2F',
      DATABASE_URL: 'postgres://u:p@h:5433/db',
    });
    expect(env).toMatchObject({
      RABBITMQ_EXCHANGE: 'domain.events',
      RABBITMQ_PREFETCH: 10,
      RABBITMQ_MAX_RETRIES: 3,
      OUTBOX_POLL_INTERVAL_MS: 1000,
      OUTBOX_BATCH_SIZE: 50,
      OUTBOX_RELAY_ENABLED: true,
    });
    expect(env.RABBITMQ_QUEUE).toBeUndefined();
  });

  it('OUTBOX_RELAY_ENABLED mặc định true, đặt false để chỉ ghi outbox (C18)', () => {
    expect(validateEnv({ SERVICE_NAME: 'x' }).OUTBOX_RELAY_ENABLED).toBe(true);
    expect(validateEnv({ SERVICE_NAME: 'x', OUTBOX_RELAY_ENABLED: 'false' })).toMatchObject({
      OUTBOX_RELAY_ENABLED: false,
    });
    expect(() => validateEnv({ SERVICE_NAME: 'x', OUTBOX_RELAY_ENABLED: 'có' })).toThrow(
      /OUTBOX_RELAY_ENABLED/,
    );
  });

  it('S3_ENDPOINT bắt buộc kèm khóa; S3_BUCKETS tách thành mảng và kiểm tra tên', () => {
    expect(() => validateEnv({ SERVICE_NAME: 'x', S3_ENDPOINT: 'http://localhost:9000' })).toThrow(
      /S3_ACCESS_KEY: THIẾU \(bắt buộc khi có S3_ENDPOINT\)/,
    );
    const base = {
      SERVICE_NAME: 'x',
      S3_ENDPOINT: 'http://localhost:9000',
      S3_ACCESS_KEY: 'k',
      S3_SECRET_KEY: 's',
    };
    expect(validateEnv({ ...base, S3_BUCKETS: ' listing-images, bank-qr ' })).toMatchObject({
      S3_BUCKETS: ['listing-images', 'bank-qr'],
      S3_REGION: 'us-east-1',
      S3_FORCE_PATH_STYLE: true,
      S3_PRESIGN_TTL_SECONDS: 900,
    });
    expect(validateEnv(base).S3_BUCKETS).toEqual([]);
    expect(() => validateEnv({ ...base, S3_BUCKETS: 'Anh_Phong' })).toThrow(/'Anh_Phong'/);
  });

  it('JWT_SECRET phải đủ dài (>= 16 ký tự)', () => {
    expect(() => validateEnv({ SERVICE_NAME: 'x', JWT_SECRET: 'ngan' })).toThrow(/JWT_SECRET/);
    expect(
      validateEnv({ SERVICE_NAME: 'x', JWT_SECRET: 'du-dai-muoi-sau-ky-tu' }).JWT_SECRET,
    ).toBeDefined();
  });
});

// Biến riêng của api-gateway: RE.GATEWAY/API_Spec.md §5
describe('validateEnv — biến riêng của api-gateway', () => {
  const base = { SERVICE_NAME: 'api-gateway' };

  it('áp mặc định đúng theo API_Spec §5', () => {
    expect(validateEnv(base)).toMatchObject({
      GATEWAY_PROXY_TIMEOUT_MS: 10000,
      RATE_LIMIT_TTL_SECONDS: 60,
      RATE_LIMIT_IP: 100,
      RATE_LIMIT_USER: 300,
      CORS_ORIGINS: ['http://localhost:3000'],
      INTERNAL_IDENTITY_URL: 'http://identity:3001',
      INTERNAL_LISTING_URL: 'http://listing:3002',
      INTERNAL_RENTAL_URL: 'http://rental:3003',
      INTERNAL_PAYMENT_URL: 'http://payment:3004',
      INTERNAL_NOTIFICATION_URL: 'http://notification:3005',
    });
  });

  it('GATEWAY_PROXY_TIMEOUT_MS phải lớn hơn 8000 (NFR07, ngân sách đặt cọc)', () => {
    expect(() => validateEnv({ ...base, GATEWAY_PROXY_TIMEOUT_MS: '8000' })).toThrow(
      /GATEWAY_PROXY_TIMEOUT_MS/,
    );
    expect(() => validateEnv({ ...base, GATEWAY_PROXY_TIMEOUT_MS: '3000' })).toThrow(
      /GATEWAY_PROXY_TIMEOUT_MS/,
    );
    expect(
      validateEnv({ ...base, GATEWAY_PROXY_TIMEOUT_MS: '8001' }).GATEWAY_PROXY_TIMEOUT_MS,
    ).toBe(8001);
  });

  it('RATE_LIMIT_* phải là số nguyên dương', () => {
    for (const name of ['RATE_LIMIT_TTL_SECONDS', 'RATE_LIMIT_IP', 'RATE_LIMIT_USER']) {
      expect(() => validateEnv({ ...base, [name]: '0' })).toThrow(new RegExp(name));
      expect(() => validateEnv({ ...base, [name]: 'nhiều' })).toThrow(new RegExp(name));
    }
    expect(validateEnv({ ...base, RATE_LIMIT_IP: '5', RATE_LIMIT_USER: '7' })).toMatchObject({
      RATE_LIMIT_IP: 5,
      RATE_LIMIT_USER: 7,
    });
  });

  it('CORS_ORIGINS: danh sách cách nhau dấu phẩy, mỗi phần tử là origin http(s)', () => {
    expect(
      validateEnv({ ...base, CORS_ORIGINS: ' http://localhost:3000 , https://app.example.com ' })
        .CORS_ORIGINS,
    ).toEqual(['http://localhost:3000', 'https://app.example.com']);
    expect(validateEnv({ ...base, CORS_ORIGINS: '' }).CORS_ORIGINS).toEqual([
      'http://localhost:3000',
    ]);
    for (const bad of ['localhost:3000', 'ftp://x.com', 'http://x.com/duong-dan', '*']) {
      expect(() => validateEnv({ ...base, CORS_ORIGINS: bad })).toThrow(/CORS_ORIGINS/);
    }
  });

  it('INTERNAL_*_URL đổi được, sai scheme thì từ chối', () => {
    expect(
      validateEnv({ ...base, INTERNAL_IDENTITY_URL: 'http://localhost:3001' })
        .INTERNAL_IDENTITY_URL,
    ).toBe('http://localhost:3001');
    expect(() => validateEnv({ ...base, INTERNAL_RENTAL_URL: 'tcp://rental:3003' })).toThrow(
      /INTERNAL_RENTAL_URL/,
    );
  });
});
