import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SELF_REGISTER_ROLES } from '../entities/user.entity';
import type { UserRole } from '../entities/user.entity';

/** Chuẩn hóa chuỗi trước khi validate: bỏ khoảng trắng đầu/cuối. Giá trị không phải chuỗi để nguyên cho validator báo lỗi. */
export const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Email luôn về chữ thường để "A@x.com" và "a@x.com" là cùng một tài khoản. */
export const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Giới hạn mật khẩu dùng chung cho đăng ký và đặt lại mật khẩu (`API_Spec §1.7`). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Số di động Việt Nam: 10 chữ số, bắt đầu bằng 0 (chốt 2026-11-16). */
export const PHONE_PATTERN = /^0\d{9}$/;

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
  @ApiProperty({
    example: 'Mat-khau-du-dai-1',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    format: 'password',
  })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
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

  /** Không bắt buộc, duy nhất khi có (B9): trùng thì `409 IDENTITY_PHONE_TAKEN`. */
  @ApiPropertyOptional({ example: '0912345678', pattern: PHONE_PATTERN.source })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(PHONE_PATTERN, {
    message: 'phone phải là số di động Việt Nam gồm 10 chữ số, bắt đầu bằng 0',
  })
  phone?: string;
}
