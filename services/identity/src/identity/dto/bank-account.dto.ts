import { ApiProperty } from '@nestjs/swagger';

/** Tài khoản nhận tiền trả cho chính chủ (route 6, 7). KHÔNG bao giờ có số đầy đủ. */
export class BankAccountDto {
  @ApiProperty({ example: 'Vietcombank' })
  bankName!: string;

  @ApiProperty({ example: 'TRAN THI BINH' })
  accountHolder!: string;

  @ApiProperty({ example: '6789', minLength: 4, maxLength: 4 })
  accountLast4!: string;

  @ApiProperty({ format: 'date-time', example: '2026-11-19T03:00:00.000Z' })
  updatedAt!: string;

  /** Dựng từng trường (danh sách trắng): thêm cột vào entity hoặc vào RETURNING cũng không lộ ra API. */
  static from(row: {
    bankName: string;
    accountHolder: string;
    accountLast4: string;
    updatedAt: Date;
  }): BankAccountDto {
    return {
      bankName: row.bankName,
      accountHolder: row.accountHolder,
      accountLast4: row.accountLast4,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
