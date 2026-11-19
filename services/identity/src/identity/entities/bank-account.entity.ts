import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Tài khoản nhận tiền của một người dùng (một người một dòng, `PUT` ghi đè).
 * Số tài khoản chỉ lưu dạng mã hóa (`BankAccountCipher`); `accountLast4` để hiển thị.
 */
@Entity({ name: 'bank_accounts' })
export class BankAccount {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'bank_name', type: 'varchar', length: 100 })
  bankName!: string;

  @Column({ name: 'account_holder', type: 'varchar', length: 200 })
  accountHolder!: string;

  /** iv(12) ‖ authTag(16) ‖ ciphertext. Không bao giờ đưa vào response hay log. */
  @Column({ name: 'account_number_encrypted', type: 'bytea' })
  accountNumberEncrypted!: Buffer;

  @Column({ name: 'account_last4', type: 'char', length: 4 })
  accountLast4!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
