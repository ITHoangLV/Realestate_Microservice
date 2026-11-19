import { Controller, Get, Param } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator';
import { createUuidParamPipe } from '../../common/errors/uuid-param.pipe';
import { BankAccountService } from '../services/bank-account.service';
import type { BankAccountFull } from '../services/bank-account.service';

/**
 * API NỘI BỘ của identity (/internal/users/...): chỉ service khác gọi (payment lấy tài khoản nhận
 * tiền, S3), KHÔNG gắn prefix /api/v1, không có trong Swagger công khai, gateway trả 404 cho
 * /internal/* từ bên ngoài. Hợp đồng: contracts/openapi/identity-internal.v1.yaml.
 *
 * @Public(): tin mạng Docker (hạn chế đã biết, `security-policy.md §6`).
 */
@ApiExcludeController()
@Public()
@Controller('internal/users')
export class UsersInternalController {
  constructor(private readonly bankAccounts: BankAccountService) {}

  /**
   * Trả số tài khoản ĐẦY ĐỦ (đã giải mã) cho payment chuyển tiền. Body đúng 4 trường
   * `{ userId, bankName, accountHolder, accountNumber }` (schema có additionalProperties:false).
   * Không log số này; chưa khai -> 404 IDENTITY_BANK_ACCOUNT_NOT_FOUND; `id` không phải UUID -> 400.
   */
  @Get(':id/bank-account')
  bankAccount(@Param('id', createUuidParamPipe('id')) id: string): Promise<BankAccountFull> {
    return this.bankAccounts.getForPayout(id);
  }
}
