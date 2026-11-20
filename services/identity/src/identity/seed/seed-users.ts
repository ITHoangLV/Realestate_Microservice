import { DataSource } from 'typeorm';
import { buildDomainEvent } from '../../messaging/domain-event';
import { PasswordService } from '../services/password.service';
import { PASSWORD_MAX_LENGTH } from './seed-admin';
import { SEED_USERS } from './seed-users.data';

export interface SeedUsersInput {
  password: string;
}

export interface SeedUsersResult {
  /** Số tài khoản vừa tạo mới. */
  created: number;
  /** Số tài khoản đã có sẵn đúng id, email, vai trò: không đổi gì. */
  existing: number;
}

/** Lỗi do đầu vào hoặc dữ liệu hiện có không cho phép nạp seed (script in thông điệp rồi thoát). */
export class SeedUsersError extends Error {}

/** Mật khẩu seed dài như mật khẩu ADMIN (12): các tài khoản này có mặt trong repo công khai. */
export const SEED_USER_PASSWORD_MIN_LENGTH = 12;

interface ExistingRow {
  id: string;
  email: string;
  role: string;
}

/**
 * Nạp 3 chủ trọ và 5 người thuê cố định (`SEED_USERS`) vào `users`. Mọi tài khoản dùng chung một mật khẩu.
 *
 * Không ghi `status`, `email_verified_at`: hai cột đó thuộc T2.5 (tech-debt #16). Sau T2.5 các tài khoản
 * này vẫn `ACTIVE` nhờ `DEFAULT`.
 *
 * Chạy lại an toàn: trong MỘT transaction, với từng người `INSERT ... ON CONFLICT DO NOTHING`.
 *  - Chưa có: tạo và ghi event `identity.registered` vào outbox cùng transaction.
 *  - Đã có đúng id, email, vai trò: bỏ qua, không đổi mật khẩu, không ghi event thêm.
 *  - Email hoặc id đã dùng cho dòng khác (khác id, email hoặc vai trò): `SeedUsersError`, cả transaction
 *    được hoàn tác. Không tự sửa dữ liệu của người khác.
 */
export async function seedUsers(
  dataSource: DataSource,
  input: SeedUsersInput,
  passwords: PasswordService = new PasswordService(),
): Promise<SeedUsersResult> {
  if (input.password.length < SEED_USER_PASSWORD_MIN_LENGTH) {
    throw new SeedUsersError(
      `SEED_USER_PASSWORD phải có ít nhất ${SEED_USER_PASSWORD_MIN_LENGTH} ký tự`,
    );
  }
  if (input.password.length > PASSWORD_MAX_LENGTH) {
    throw new SeedUsersError(`SEED_USER_PASSWORD tối đa ${PASSWORD_MAX_LENGTH} ký tự`);
  }

  // Một hash cho cả 8 tài khoản: argon2id đã có salt ngẫu nhiên trong chuỗi hash, không cần hash 8 lần.
  const passwordHash = await passwords.hash(input.password);

  return dataSource.transaction(async (manager) => {
    let created = 0;
    let existing = 0;

    for (const user of SEED_USERS) {
      const inserted: Array<{ id: string }> = await manager.query(
        `INSERT INTO users (id, email, password_hash, full_name, role)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [user.id, user.email, passwordHash, user.fullName, user.role],
      );

      if (inserted.length === 0) {
        const rows: ExistingRow[] = await manager.query(
          `SELECT id, email, role FROM users WHERE id = $1 OR lower(email) = $2`,
          [user.id, user.email],
        );
        const matches =
          rows.length === 1 &&
          rows[0].id === user.id &&
          rows[0].email.toLowerCase() === user.email &&
          rows[0].role === user.role;
        if (!matches) {
          const found = rows
            .map((r) => `id ${r.id}, email ${r.email}, vai trò ${r.role}`)
            .join(' | ');
          throw new SeedUsersError(
            `Không nạp được ${user.email} (id ${user.id}, vai trò ${user.role}): trong identity_db đã có ${found || 'dòng xung đột không đọc lại được'}. ` +
              'Xóa hoặc đổi dòng đó, hoặc reset DB dev (RE_Docker_Local_Guide.md §7).',
          );
        }
        existing += 1;
        continue;
      }

      const event = buildDomainEvent({
        eventType: 'identity.registered',
        payload: {
          userId: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
        },
        producer: 'identity',
      });
      await manager.query(
        `INSERT INTO outbox_events (id, event_type, envelope) VALUES ($1, $2, $3::jsonb)`,
        [event.eventId, event.eventType, JSON.stringify(event)],
      );
      created += 1;
    }

    return { created, existing };
  });
}
