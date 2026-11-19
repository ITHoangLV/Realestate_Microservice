import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';
import { trim } from './register.dto';

/** Body của `PUT /users/me/bank-account` (`RE.IDENTITY/API_Spec.md §1.4`). Không có `userId`: chỉ tin `sub` trong JWT. */
export class UpsertBankAccountDto {
  @ApiProperty({ example: 'Vietcombank', minLength: 2, maxLength: 100 })
  @IsString()
  @Length(2, 100)
  bankName!: string;

  /** Là chuỗi (không nhận số) để không mất số 0 đầu và không vượt độ chính xác của số nguyên. */
  @ApiProperty({ example: '0123456789', pattern: '^\\d{6,19}$' })
  @IsString()
  @Matches(/^\d{6,19}$/, { message: 'accountNumber chỉ gồm 6 đến 19 chữ số' })
  accountNumber!: string;

  @ApiProperty({ example: 'TRAN THI BINH', minLength: 1, maxLength: 200 })
  // trim: cắt khoảng trắng hai đầu trước khi kiểm độ dài (chuỗi toàn khoảng trắng thành rỗng -> 400)
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  accountHolder!: string;
}
