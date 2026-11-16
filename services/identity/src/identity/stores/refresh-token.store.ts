/** Kết quả đổi refresh token cũ lấy token mới. */
export type RotateResult =
  /** Thành công: token cũ đã bị đánh dấu dùng, token mới đã được lưu cùng họ. */
  | { status: 'ok'; userId: string; familyId: string }
  /** Token không tồn tại, hết hạn, hoặc họ của nó đã bị thu hồi (ví dụ đã logout). */
  | { status: 'invalid' }
  /** Token ĐÃ DÙNG rồi mà lại bị gửi lên: nghi bị đánh cắp, cả họ đã bị thu hồi. */
  | { status: 'reuse'; userId: string; familyId: string };

/**
 * Nơi lưu refresh token. AuthService chỉ làm việc qua interface này, nên đổi sang lưu ở nơi khác
 * (ví dụ Postgres) chỉ cần viết lớp cài đặt mới, API và token trả cho client không đổi.
 *
 * Quy ước: tham số `token` luôn là token GỐC (chuỗi client giữ). Cài đặt tự băm trước khi lưu,
 * để không bao giờ lưu token gốc.
 */
export interface RefreshTokenStore {
  /** Lưu token đầu tiên của một họ mới (lúc đăng nhập). */
  create(token: string, userId: string, familyId: string): Promise<void>;

  /** Đổi `oldToken` lấy `newToken`, nguyên tử: hai yêu cầu đồng thời cùng token cũ thì chỉ một cái ok. */
  rotate(oldToken: string, newToken: string): Promise<RotateResult>;

  /** Thu hồi cả họ của token (đăng xuất). Trả false nếu token không tồn tại. */
  revokeFamilyOf(token: string): Promise<boolean>;
}

/** Token DI để inject `RefreshTokenStore` (interface không inject trực tiếp được). */
export const REFRESH_TOKEN_STORE = Symbol('REFRESH_TOKEN_STORE');
