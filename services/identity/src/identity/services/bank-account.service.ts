import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BankAccountDto } from '../dto/bank-account.dto';
import type { UpsertBankAccountDto } from '../dto/upsert-bank-account.dto';
import { BankAccount } from '../entities/bank-account.entity';
import { bankAccountNotFound } from '../errors/identity.errors';
import { BankAccountCipher } from './bank-account.cipher';

/** Tài khoản nhận tiền đầy đủ, chỉ trả cho API nội bộ (payment chuyển tiền). Không log, không lưu lại. */
export interface BankAccountFull {
  userId: string;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
}

/**
 * Một câu INSERT … ON CONFLICT: một người một dòng, `PUT` ghi đè. Nguyên tử, hai PUT đồng thời không
 * lỗi trùng khóa. `updated_at = now()` phải ghi rõ vì DEFAULT chỉ áp dụng lúc INSERT.
 * `created_at` và `id` giữ nguyên khi ghi đè.
 */
const UPSERT_SQL = `
  INSERT INTO bank_accounts
    (user_id, bank_name, account_holder, account_number_encrypted, account_last4)
  VALUES ($1, $2, $3, $4, $5)
  ON CONFLICT (user_id) DO UPDATE SET
    bank_name = EXCLUDED.bank_name,
    account_holder = EXCLUDED.account_holder,
    account_number_encrypted = EXCLUDED.account_number_encrypted,
    account_last4 = EXCLUDED.account_last4,
    updated_at = now()
  RETURNING bank_name AS "bankName", account_holder AS "accountHolder",
            account_last4 AS "accountLast4", updated_at AS "updatedAt"
`;

@Injectable()
export class BankAccountService {
  constructor(
    @InjectRepository(BankAccount) private readonly accounts: Repository<BankAccount>,
    private readonly dataSource: DataSource,
    private readonly cipher: BankAccountCipher,
  ) {}

  /** Khai hoặc ghi đè tài khoản nhận tiền của chính người gọi. 1 truy vấn. */
  async upsertMine(userId: string, dto: UpsertBankAccountDto): Promise<BankAccountDto> {
    const encrypted = this.cipher.encrypt(dto.accountNumber, userId);
    const last4 = dto.accountNumber.slice(-4);
    const rows = await this.dataSource.query(UPSERT_SQL, [
      userId,
      dto.bankName,
      dto.accountHolder,
      encrypted,
      last4,
    ]);
    return BankAccountDto.from(rows[0]);
  }

  /** Xem tài khoản của chính mình (chỉ bốn số cuối). 1 truy vấn, không đọc cột số mã hóa. */
  async getMine(userId: string): Promise<BankAccountDto> {
    const row = await this.accounts.findOne({
      where: { userId },
      select: { bankName: true, accountHolder: true, accountLast4: true, updatedAt: true },
    });
    if (!row) throw bankAccountNotFound();
    return BankAccountDto.from(row);
  }

  /**
   * Số đầy đủ cho payment (`GET /internal/users/:id/bank-account`). 1 truy vấn.
   * Giải mã lỗi (khóa sai, dữ liệu hỏng, dòng của người khác) ném `Error` thường: filter đổi thành
   * `500 INTERNAL_ERROR`, không lộ chi tiết.
   */
  async getForPayout(userId: string): Promise<BankAccountFull> {
    const row = await this.accounts.findOne({
      where: { userId },
      select: { bankName: true, accountHolder: true, accountNumberEncrypted: true },
    });
    if (!row) throw bankAccountNotFound();
    return {
      userId,
      bankName: row.bankName,
      accountHolder: row.accountHolder,
      accountNumber: this.cipher.decrypt(row.accountNumberEncrypted, userId),
    };
  }
}
