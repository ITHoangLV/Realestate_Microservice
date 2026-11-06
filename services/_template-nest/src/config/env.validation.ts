import Joi from 'joi';

/** Kiểu biến môi trường sau khi validate (đã áp mặc định). */
export interface EnvVars {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  SERVICE_NAME: string;
  SERVICE_VERSION?: string;
  LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  LOG_PRETTY: boolean;
  HTTP_TIMEOUT_MS: number;
  HTTP_MAX_RETRIES: number;
  SWAGGER_ENABLED: boolean;
  IDEMPOTENCY_TTL_SECONDS: number;
  // Tùy chọn: có biến thì bật module tương ứng
  DATABASE_URL?: string;
  REDIS_URL?: string;
  RABBITMQ_URL?: string;
  JWT_PUBLIC_KEY?: string;
  JWT_PUBLIC_KEY_PATH?: string;
  JWT_SECRET?: string;
  JWT_ISSUER?: string;
}

const optionalString = Joi.string().trim().empty('');

export const envSchema = Joi.object<EnvVars>({
  // --- Tối thiểu ---
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  SERVICE_NAME: Joi.string().trim().min(1).required(),
  SERVICE_VERSION: optionalString,
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),
  LOG_PRETTY: Joi.boolean().default(false),

  // --- HTTP client / Swagger / Idempotency ---
  HTTP_TIMEOUT_MS: Joi.number().integer().min(100).default(3000),
  HTTP_MAX_RETRIES: Joi.number().integer().min(0).max(5).default(2),
  SWAGGER_ENABLED: Joi.boolean().default(true),
  IDEMPOTENCY_TTL_SECONDS: Joi.number().integer().min(1).default(86400),

  // --- Tùy chọn ---
  DATABASE_URL: optionalString.uri({ scheme: ['postgres', 'postgresql'] }),
  REDIS_URL: optionalString.uri({ scheme: ['redis', 'rediss'] }),
  RABBITMQ_URL: optionalString.uri({ scheme: ['amqp', 'amqps'] }),
  JWT_PUBLIC_KEY: optionalString,
  JWT_PUBLIC_KEY_PATH: optionalString,
  JWT_SECRET: optionalString.min(16),
  JWT_ISSUER: optionalString,
});

/** Gom lỗi Joi thành thông báo tiếng Việt, liệt kê rõ từng biến sai/thiếu. */
export function formatEnvErrors(error: Joi.ValidationError): string {
  const lines = error.details.map((d) => {
    const name = d.path.join('.');
    return d.type === 'any.required'
      ? `  - ${name}: THIẾU (bắt buộc)`
      : `  - ${name}: ${d.message.replace(/"[^"]+" /, '')}`;
  });
  return `Cấu hình môi trường không hợp lệ:\n${lines.join('\n')}`;
}

/** Dùng cho ConfigModule: ném lỗi khi sai, trả về giá trị đã áp mặc định khi đúng. */
export function validateEnv(raw: Record<string, unknown>): EnvVars {
  const { error, value } = envSchema.validate(raw, { abortEarly: false, allowUnknown: true });
  if (error) {
    throw new Error(formatEnvErrors(error));
  }
  return value as EnvVars;
}
