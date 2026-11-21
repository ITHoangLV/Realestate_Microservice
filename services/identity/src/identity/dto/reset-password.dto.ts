import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './register.dto';

/** Body `POST /auth/reset-password` (route 13). Mật khẩu mới theo đúng luật của đăng ký. */
export class ResetPasswordDto {
  /** Token ngẫu nhiên 32 byte dạng base64url (43 ký tự); trần 256 để không nhận chuỗi khổng lồ. */
  @ApiProperty({ example: 'k3J1zv0m...' })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  token!: string;

  @ApiProperty({
    example: 'Mat-khau-moi-1',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    format: 'password',
  })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  newPassword!: string;
}
