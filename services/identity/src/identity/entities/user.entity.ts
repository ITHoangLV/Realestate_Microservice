import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Vai trò trong hệ thống. ADMIN chỉ tạo được bằng script seed, không đăng ký qua API. */
export const USER_ROLES = ['TENANT', 'LANDLORD', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Vai trò người dùng được TỰ chọn khi đăng ký. */
export const SELF_REGISTER_ROLES = ['TENANT', 'LANDLORD'] as const;

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Luôn lưu CHỮ THƯỜNG (AuthService chuẩn hóa trước khi ghi). Migration có thêm unique index
   * trên lower(email) để DB cũng chặn trùng không phân biệt hoa thường.
   */
  @Column({ type: 'text' })
  email!: string;

  /**
   * Hash argon2id. null = tài khoản chỉ đăng nhập bằng nhà cung cấp ngoài (Google), chưa có mật khẩu.
   */
  @Column({ name: 'password_hash', type: 'text', nullable: true })
  passwordHash!: string | null;

  @Column({ name: 'full_name', type: 'varchar', length: 200 })
  fullName!: string;

  @Column({ type: 'text' })
  role!: UserRole;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
