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
    });
    expect(env.RABBITMQ_QUEUE).toBeUndefined();
  });

  it('JWT_SECRET phải đủ dài (>= 16 ký tự)', () => {
    expect(() => validateEnv({ SERVICE_NAME: 'x', JWT_SECRET: 'ngan' })).toThrow(/JWT_SECRET/);
    expect(
      validateEnv({ SERVICE_NAME: 'x', JWT_SECRET: 'du-dai-muoi-sau-ky-tu' }).JWT_SECRET,
    ).toBeDefined();
  });
});
