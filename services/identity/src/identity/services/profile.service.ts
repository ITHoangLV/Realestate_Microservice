import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { UserDto } from '../dto/user.dto';
import { User } from '../entities/user.entity';
import { phoneTaken } from '../errors/identity.errors';
import { uniqueViolationConstraint } from './unique-violation';

/** Hồ sơ của chính người đăng nhập (route 15). `userId` luôn là `sub` trong JWT, không bao giờ từ body. */
@Injectable()
export class ProfileService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  /**
   * `PATCH /users/me`: sửa họ tên, số điện thoại. Chỉ ghi trường có mặt; `phone: null` xóa số. Trùng số của
   * người khác -> `409 IDENTITY_PHONE_TAKEN` (ràng buộc duy nhất của DB quyết định, không SELECT trước).
   * Đúng 2 truy vấn DB (UPDATE, SELECT).
   */
  async update(userId: string, dto: UpdateProfileDto): Promise<UserDto> {
    const changes: Partial<Pick<User, 'fullName' | 'phone'>> = {};
    if (dto.fullName !== undefined) changes.fullName = dto.fullName;
    if (dto.phone !== undefined) changes.phone = dto.phone;
    if (Object.keys(changes).length === 0) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'Cần ít nhất một trường để sửa: fullName hoặc phone',
        400,
      );
    }

    let affected: number | undefined;
    try {
      ({ affected } = await this.users.update({ id: userId }, changes));
    } catch (err) {
      if (uniqueViolationConstraint(err) !== undefined) throw phoneTaken();
      throw err;
    }
    const user = affected ? await this.users.findOneBy({ id: userId }) : null;
    if (!user) {
      // Token còn hạn nhưng user đã bị xóa (giống GET /me)
      throw new AppException(ErrorCode.AUTH_TOKEN_INVALID, 'Token không hợp lệ', 401);
    }
    return UserDto.from(user);
  }
}
