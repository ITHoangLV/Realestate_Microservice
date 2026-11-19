import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { ApiEnvelope } from '../../common/response/api-envelope.decorator';
import { BankAccountDto } from '../dto/bank-account.dto';
import { UpsertBankAccountDto } from '../dto/upsert-bank-account.dto';
import { BankAccountService } from '../services/bank-account.service';

/**
 * Tài khoản nhận tiền của chính người đăng nhập: /api/v1/users/me/bank-account (route 6, 7).
 * Không @Public(): JwtAuthGuard toàn cục yêu cầu access token. Người gọi luôn là `sub` trong JWT.
 */
@ApiTags('users')
@ApiBearerAuth()
@Controller('users/me/bank-account')
export class BankAccountController {
  constructor(private readonly bankAccounts: BankAccountService) {}

  @Get()
  @ApiOperation({ summary: 'Xem tài khoản nhận tiền của tôi (chỉ bốn số cuối)' })
  @ApiEnvelope(BankAccountDto)
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'IDENTITY_BANK_ACCOUNT_NOT_FOUND' })
  get(@CurrentUser('sub') userId: string): Promise<BankAccountDto> {
    return this.bankAccounts.getMine(userId);
  }

  @Put()
  @ApiOperation({ summary: 'Khai hoặc ghi đè tài khoản nhận tiền (số tài khoản mã hóa khi lưu)' })
  @ApiEnvelope(BankAccountDto)
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  put(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpsertBankAccountDto,
  ): Promise<BankAccountDto> {
    return this.bankAccounts.upsertMine(userId, dto);
  }
}
