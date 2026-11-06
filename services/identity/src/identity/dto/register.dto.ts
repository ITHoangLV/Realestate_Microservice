import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { SELF_REGISTER_ROLES } from '../entities/user.entity';
import type { UserRole } from '../entities/user.entity';

/** Chuẩn hóa chuỗi trước khi validate: bỏ khoảng trắng đầu/cuối. Giá trị không phải chuỗi để nguyên cho validator báo lỗi. */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Email luôn về chữ thường để "A@x.com" và "a@x.com" là cùng một tài khoản. */
export const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @ApiProperty({ example: 'chu.nha@example.com', maxLength: 254 })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  /**
   * Tối đa 128 ký tự: argon2 tốn tài nguyên theo độ dài, không giới hạn thì kẻ xấu gửi
   * mật khẩu vài MB để làm nghẽn server.
   */
  @ApiProperty({ example: 'Mat-khau-du-dai-1', minLength: 8, maxLength: 128, format: 'password' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ example: 'Nguyễn Văn An', minLength: 1, maxLength: 200 })
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  fullName!: string;

  /** ADMIN không có trong danh sách: tài khoản quản trị chỉ tạo bằng script seed. */
  @ApiProperty({ enum: SELF_REGISTER_ROLES, example: 'TENANT' })
  @IsIn(SELF_REGISTER_ROLES)
  role!: Extract<UserRole, 'TENANT' | 'LANDLORD'>;
}
