import { DataSource } from 'typeorm';
import { buildDomainEvent } from '../../messaging/domain-event';
import { PasswordService } from '../services/password.service';

export interface SeedAdminInput {
  email: string;
  password: string;
  fullName?: string;
}

export interface SeedAdminResult {
  /** created: vừa tạo mới. exists: đã có sẵn ADMIN với email này, không đổi gì. */
  status: 'created' | 'exists';
  userId: string;
}

/** Lỗi do đầu vào hoặc dữ liệu hiện có không cho phép tạo ADMIN (script in thông điệp rồi thoát). */
export class SeedAdminError extends Error {}

/** Mật khẩu ADMIN yêu cầu dài hơn người dùng thường (8): tài khoản này có quyền cao nhất. */
export const ADMIN_PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Tạo tài khoản ADMIN. Đây là CÁCH DUY NHẤT tạo ADMIN: API đăng ký không cho chọn vai trò này.
 *
 * Luồng: kiểm tra đầu vào -> hash mật khẩu -> trong MỘT transaction: INSERT user (bỏ qua nếu
 * trùng email) và ghi event identity.registered vào outbox. Chạy lại nhiều lần an toàn:
 *  - email đã là ADMIN: báo `exists`, KHÔNG đổi mật khẩu, không ghi event thêm.
 *  - email đã là TENANT/LANDLORD: từ chối, KHÔNG tự nâng quyền (tránh biến người dùng thường
 *    thành quản trị viên chỉ vì gõ nhầm email).
 */
export async function seedAdmin(
  dataSource: DataSource,
  input: SeedAdminInput,
  passwords: PasswordService = new PasswordService(),
): Promise<SeedAdminResult> {
  const email = input.email.trim().toLowerCase();
  const fullName = (input.fullName ?? 'Quản trị viên').trim();

  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw new SeedAdminError('SEED_ADMIN_EMAIL không phải email hợp lệ');
  }
  if (input.password.length < ADMIN_PASSWORD_MIN_LENGTH) {
    throw new SeedAdminError(
      `SEED_ADMIN_PASSWORD phải có ít nhất ${ADMIN_PASSWORD_MIN_LENGTH} ký tự`,
    );
  }
  if (input.password.length > PASSWORD_MAX_LENGTH) {
    throw new SeedAdminError(`SEED_ADMIN_PASSWORD tối đa ${PASSWORD_MAX_LENGTH} ký tự`);
  }
  if (fullName.length < 1 || fullName.length > 200) {
    throw new SeedAdminError('SEED_ADMIN_NAME phải dài 1 đến 200 ký tự');
  }

  const passwordHash = await passwords.hash(input.password);

  return dataSource.transaction(async (manager) => {
    const inserted: Array<{ id: string }> = await manager.query(
      `INSERT INTO users (email, password_hash, full_name, role, status, email_verified_at)
       VALUES ($1, $2, $3, 'ADMIN', 'ACTIVE', now())
       ON CONFLICT ((lower(email))) DO NOTHING
       RETURNING id`,
      [email, passwordHash, fullName],
    );

    if (inserted.length === 0) {
      const [existing]: Array<{ id: string; role: string }> = await manager.query(
        `SELECT id, role FROM users WHERE lower(email) = $1`,
        [email],
      );
      if (existing?.role !== 'ADMIN') {
        throw new SeedAdminError(
          `Email ${email} đã được đăng ký với vai trò ${existing?.role ?? '?'}, không tự nâng thành ADMIN. Dùng email khác.`,
        );
      }
      return { status: 'exists', userId: existing.id };
    }

    const userId = inserted[0].id;
    const event = buildDomainEvent({
      eventType: 'identity.registered',
      payload: { userId, email, fullName, role: 'ADMIN' },
      producer: 'identity',
    });
    await manager.query(
      `INSERT INTO outbox_events (id, event_type, envelope) VALUES ($1, $2, $3::jsonb)`,
      [event.eventId, event.eventType, JSON.stringify(event)],
    );
    return { status: 'created', userId };
  });
}
