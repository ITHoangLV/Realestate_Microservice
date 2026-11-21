import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { trim } from './register.dto';

/** Body `POST /admin/users/:id/lock` (route 16): lý do bắt buộc, lưu ở `users.lock_reason` (varchar 500). */
export class LockUserDto {
  @ApiProperty({ example: 'Nghi ngờ lừa đảo', minLength: 1, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(1, 500)
  reason!: string;
}
