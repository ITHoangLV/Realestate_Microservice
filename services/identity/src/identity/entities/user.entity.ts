import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Vai trò trong hệ thống. ADMIN chỉ tạo được bằng script seed, không đăng ký qua API. */
export const USER_ROLES = ['TENANT', 'LANDLORD', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * Trạng thái tài khoản: chưa nhập OTP, dùng được, bị quản trị viên khóa.
 * Khớp CHECK `CK_users_status` của migration.
 */
export const USER_STATUSES = ['PENDING_VERIFICATION', 'ACTIVE', 'LOCKED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

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

  /** Số di động Việt Nam `^0\d{9}$`, duy nhất khi có (UQ_users_phone). null = chưa khai. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  phone!: string | null;

  /** Đăng ký mới ghi PENDING_VERIFICATION; cột DB mặc định ACTIVE cho dòng có trước migration. */
  @Column({ type: 'text', default: 'ACTIVE' })
  status!: UserStatus;

  /** Có giá trị = email đã xác minh. Mở khóa dựa vào đây để chọn ACTIVE hay PENDING_VERIFICATION. */
  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt!: Date | null;

  @Column({ name: 'locked_by', type: 'uuid', nullable: true })
  lockedBy!: string | null;

  @Column({ name: 'lock_reason', type: 'varchar', length: 500, nullable: true })
  lockReason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
