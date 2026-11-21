import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';
import { normalizeEmail } from './register.dto';

/** Body chỉ có email: `resend-otp` (route 11) và `forgot-password` (route 12). */
export class EmailOnlyDto {
  @ApiProperty({ example: 'chu.nha@example.com', maxLength: 254 })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
