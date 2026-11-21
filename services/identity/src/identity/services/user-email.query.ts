import { Raw } from 'typeorm';
import type { Repository } from 'typeorm';
import type { User } from '../entities/user.entity';

/**
 * Tìm người dùng theo email, không phân biệt hoa thường. So khớp theo `lower(email)` để dùng đúng index
 * `UQ_users_email_lower`. Dùng chung cho đăng nhập, OTP, quên mật khẩu, Google.
 */
export function findUserByEmail(users: Repository<User>, email: string): Promise<User | null> {
  return users.findOne({
    where: { email: Raw((alias) => `lower(${alias}) = :email`, { email: email.toLowerCase() }) },
  });
}
