import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';
import { normalizeEmail } from './register.dto';

/** OTP: đúng 6 chữ số (có thể bắt đầu bằng 0 nên là chuỗi). */
const OTP_PATTERN = /^\d{6}$/;

/** Body `POST /auth/verify-otp` (route 10). */
export class VerifyOtpDto {
  @ApiProperty({ example: 'chu.nha@example.com', maxLength: 254 })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  /** Đúng 6 chữ số, có thể bắt đầu bằng 0 nên là chuỗi. */
  @ApiProperty({ example: '012345', pattern: OTP_PATTERN.source })
  @IsString()
  @Matches(OTP_PATTERN, { message: 'otp phải gồm đúng 6 chữ số' })
  otp!: string;
}
