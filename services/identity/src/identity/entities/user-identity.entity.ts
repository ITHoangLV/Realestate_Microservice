import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Nhà cung cấp đăng nhập ngoài. Thêm 'google' khi làm đăng nhập Google. */
export type IdentityProvider = 'google';

/**
 * Một cách đăng nhập bằng bên thứ ba của user: (provider, providerUserId) trỏ về users.id.
 * Một user có thể có nhiều dòng (Google, sau này Facebook...). Đăng nhập bằng email + mật khẩu
 * KHÔNG nằm ở đây mà dùng users.password_hash.
 *
 * Hiện chỉ `GoogleAuthService` ghi vào đây (liên kết khi đăng nhập Google lần đầu).
 */
@Entity({ name: 'user_identities' })
export class UserIdentity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'text' })
  provider!: IdentityProvider;

  /** ID người dùng do nhà cung cấp cấp (Google: claim `sub`), ổn định, không đổi khi user đổi email. */
  @Column({ name: 'provider_user_id', type: 'text' })
  providerUserId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
