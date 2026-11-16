import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EnvVars } from '../../config/env.validation';
import type { UserRole } from '../entities/user.entity';

export interface AccessToken {
  accessToken: string;
  /** Số giây access token còn sống (client dùng để biết khi nào cần refresh). */
  expiresIn: number;
}

/** Đọc khóa riêng: JWT_PRIVATE_KEY (PEM, xuống dòng viết \n) ưu tiên, sau đó JWT_PRIVATE_KEY_PATH. */
export function loadPrivateKey(env: {
  JWT_PRIVATE_KEY?: string;
  JWT_PRIVATE_KEY_PATH?: string;
}): string {
  if (env.JWT_PRIVATE_KEY) return env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
  if (env.JWT_PRIVATE_KEY_PATH) {
    try {
      // Đường dẫn tương đối tính từ thư mục chạy service (services/identity), giống JWT_PUBLIC_KEY_PATH
      return readFileSync(resolve(env.JWT_PRIVATE_KEY_PATH), 'utf8');
    } catch {
      throw new Error(`Không đọc được JWT_PRIVATE_KEY_PATH: ${env.JWT_PRIVATE_KEY_PATH}`);
    }
  }
  throw new Error('Thiếu JWT_PRIVATE_KEY hoặc JWT_PRIVATE_KEY_PATH');
}

/**
 * Tạo token:
 *  - Access token: JWT ký RS256 bằng khóa RIÊNG. Các service khác chỉ cần khóa công khai để kiểm tra.
 *  - Refresh token: chuỗi ngẫu nhiên, KHÔNG phải JWT. Server không "đọc" được gì từ nó; mọi thông tin
 *    (user nào, họ token nào) nằm trong Redis (xem RefreshTokenStore).
 */
@Injectable()
export class TokenService {
  private readonly privateKey: string;
  private readonly issuer: string;
  private readonly accessTtl: number;

  constructor(
    config: ConfigService<EnvVars, true>,
    private readonly jwt: JwtService,
  ) {
    // Đọc khóa MỘT lần lúc khởi động: thiếu/sai đường dẫn thì service dừng ngay, không đợi tới request đầu
    this.privateKey = loadPrivateKey({
      JWT_PRIVATE_KEY: config.get('JWT_PRIVATE_KEY', { infer: true }),
      JWT_PRIVATE_KEY_PATH: config.get('JWT_PRIVATE_KEY_PATH', { infer: true }),
    });
    this.issuer = config.get('JWT_ISSUER', { infer: true }) as string;
    this.accessTtl = config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
  }

  /**
   * Claims khớp với AuthUser mà JwtAuthGuard của mọi service đọc: `sub` (id user), `roles` (mảng), `exp`.
   * `jti` là mã riêng của từng token, sau này dùng nếu cần thu hồi access token.
   */
  async signAccessToken(user: { id: string; role: UserRole }): Promise<AccessToken> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, roles: [user.role] },
      {
        algorithm: 'RS256',
        privateKey: this.privateKey,
        issuer: this.issuer,
        expiresIn: this.accessTtl,
        jwtid: randomUUID(),
      },
    );
    return { accessToken, expiresIn: this.accessTtl };
  }

  /** 32 byte ngẫu nhiên (256 bit) mã hóa base64url: không đoán được, an toàn đưa vào body JSON. */
  generateRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }
}
