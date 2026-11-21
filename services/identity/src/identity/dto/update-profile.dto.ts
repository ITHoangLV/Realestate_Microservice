import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches, ValidateIf } from 'class-validator';
import { PHONE_PATTERN, trim } from './register.dto';

/** Body `PATCH /users/me` (route 15). Chỉ sửa họ tên và số điện thoại; trường khác bị từ chối. */
export class UpdateProfileDto {
  /**
   * Vắng mặt thì giữ nguyên; `null` bị từ chối (400), vì `@IsOptional()` bỏ qua cả `null` và cột `full_name`
   * là `NOT NULL` (test 23a, `API_Spec §1.10` v2.4). Khác `phone`, nơi `null` nghĩa là xóa số.
   */
  @ApiPropertyOptional({ example: 'Nguyễn Văn An', minLength: 1, maxLength: 200 })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  fullName?: string;

  /** `null` xóa số; vắng mặt thì giữ nguyên. */
  @ApiPropertyOptional({ type: String, nullable: true, example: '0912345678' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(PHONE_PATTERN, {
    message: 'phone phải là số di động Việt Nam gồm 10 chữ số, bắt đầu bằng 0',
  })
  phone?: string | null;
}
