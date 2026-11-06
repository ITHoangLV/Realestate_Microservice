import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { normalizeEmail } from './register.dto';

export class LoginDto {
  @ApiProperty({ example: 'chu.nha@example.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  /** Không kiểm tra độ dài tối thiểu ở đây để không tiết lộ chính sách mật khẩu cho người dò. */
  @ApiProperty({ example: 'Mat-khau-du-dai-1', format: 'password' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
