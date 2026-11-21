import { OAuth2Client } from 'google-auth-library';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { googleTokenInvalid } from '../errors/identity.errors';

/** Thông tin lấy từ ID token Google đã kiểm chữ ký, `aud`, hạn. */
export interface GoogleIdentity {
  /** Claim `sub`: ID người dùng ổn định của Google. */
  sub: string;
  /** Rỗng nếu token không có email. */
  email: string;
  emailVerified: boolean;
  name?: string;
}

/** Kiểm ID token Google. Ném `401 IDENTITY_GOOGLE_TOKEN_INVALID` (token sai) hoặc `503` (không tải được khóa). */
export interface GoogleIdTokenVerifier {
  verify(idToken: string): Promise<GoogleIdentity>;
}

/** Token DI của bộ kiểm (test thay bằng bản giả). */
export const GOOGLE_ID_TOKEN_VERIFIER = Symbol('GOOGLE_ID_TOKEN_VERIFIER');

/** Mã lỗi mạng của Node: không tải được khóa công khai của Google, KHÔNG phải lỗi của token. */
const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ECONNRESET',
]);

function isUpstreamFailure(err: unknown): boolean {
  const e = err as { code?: unknown; name?: unknown; response?: unknown } | null;
  if (typeof e?.code === 'string' && NETWORK_CODES.has(e.code)) return true;
  // GaxiosError có `response` = máy chủ khóa của Google trả lỗi HTTP
  return e?.name === 'GaxiosError' && e.response !== undefined;
}

/**
 * Bọc `google-auth-library` (`OAuth2Client.verifyIdToken`, chốt 2026-11-13, `architecture.md §5`).
 * Thư viện tự tải JWKS của Google và cache theo `Cache-Control`.
 *
 * Phân biệt hai loại lỗi: token sai (chữ ký, `aud`, hạn, định dạng) -> 401; không tải được khóa của Google
 * (mạng, máy chủ Google lỗi) -> 503, để client thử lại thay vì tưởng token hỏng. Lỗi gốc KHÔNG được chép vào
 * lỗi trả ra: thông điệp của thư viện hay chứa chính token.
 */
export class GoogleLibraryVerifier implements GoogleIdTokenVerifier {
  constructor(
    private readonly clientId: string,
    private readonly client: Pick<OAuth2Client, 'verifyIdToken'> = new OAuth2Client(),
  ) {}

  async verify(idToken: string): Promise<GoogleIdentity> {
    let payload;
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: this.clientId });
      payload = ticket.getPayload();
    } catch (err) {
      if (isUpstreamFailure(err)) {
        throw new AppException(
          ErrorCode.DEPENDENCY_UNAVAILABLE,
          'Không kết nối được Google để kiểm tra đăng nhập, vui lòng thử lại sau',
          503,
        );
      }
      throw googleTokenInvalid();
    }
    if (!payload?.sub) throw googleTokenInvalid();
    return {
      sub: payload.sub,
      email: payload.email ?? '',
      emailVerified: payload.email_verified === true,
      name: payload.name,
    };
  }
}
