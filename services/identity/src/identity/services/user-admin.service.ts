import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Paginated } from '../../common/response/response-meta';
import { ListUsersQuery } from '../dto/list-users.query';
import { UserDto } from '../dto/user.dto';
import { User } from '../entities/user.entity';
import { cannotLockSelf, userNotFound } from '../errors/identity.errors';
import { REFRESH_TOKEN_STORE } from '../stores/refresh-token.store';
import type { RefreshTokenStore } from '../stores/refresh-token.store';

/** Thao tác quản trị trên người dùng: danh sách (T2.1), khóa và mở khóa (T2.5). */
@Injectable()
export class UserAdminService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @Inject(REFRESH_TOKEN_STORE) private readonly refreshTokens: RefreshTokenStore,
  ) {}

  /**
   * Danh sách người dùng cho quản trị viên (route 8). Đúng 2 truy vấn (data + count, do `findAndCount`).
   * Chỉ chọn cột của `UserDto`, không bao giờ đọc `password_hash`. Sắp `created_at DESC, id DESC`
   * (khóa phụ `id` để trang không trùng, không sót khi nhiều người cùng `created_at`); index
   * `IDX_users_created_at_id`, `IDX_users_role_created_at_id`. Trang vượt quá: `items` rỗng, `total` đúng.
   */
  async list(query: ListUsersQuery): Promise<Paginated<UserDto>> {
    const [rows, total] = await this.users.findAndCount({
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        phone: true,
        createdAt: true,
      },
      where: query.role ? { role: query.role } : {},
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: query.skip,
      take: query.pageSize,
    });
    return new Paginated(rows.map(UserDto.from), query.page, query.pageSize, total);
  }

  /**
   * Khóa tài khoản (route 16, `API_Spec §1.9`). Chỉ đổi trạng thái identity: tin, đơn, tiền của người đó
   * không bị động tới.
   *
   * Thứ tự quan trọng: (1) commit `LOCKED` trước, để chặn đăng nhập mới; (2) rồi mới thu hồi mọi phiên.
   * Redis lỗi ở bước 2 thì `503`, trạng thái vẫn là `LOCKED`; quản trị viên gọi lại để thu hồi nốt
   * (idempotent: UPDATE 0 dòng vì đã khóa vẫn chạy bước 2). Access token còn hạn tối đa 15 phút.
   * Đúng 2 truy vấn DB (UPDATE, SELECT).
   */
  async lock(adminId: string, userId: string, reason: string): Promise<UserDto> {
    if (adminId === userId) throw cannotLockSelf();

    await this.users.update(
      { id: userId, status: Not('LOCKED') },
      { status: 'LOCKED', lockedAt: () => 'now()', lockedBy: adminId, lockReason: reason },
    );
    // Đọc lại: phân biệt "không tồn tại" (404) với "đã khóa" (UPDATE 0 dòng), và có dữ liệu để trả
    const user = await this.users.findOneBy({ id: userId });
    if (!user) throw userNotFound();

    await this.refreshTokens.revokeAllForUser(userId);
    return UserDto.from(user);
  }

  /**
   * Mở khóa (route 16): về trạng thái TRƯỚC khi khóa, suy ra từ `email_verified_at`: có thì `ACTIVE`, chưa
   * có thì `PENDING_VERIFICATION` (phải nhập OTP; dùng `resend-otp`). Xóa `locked_*`. Không phải tài khoản bị
   * khóa thì không đổi gì (vẫn 200). Không đụng phiên: phiên cũ đã bị thu hồi lúc khóa.
   */
  async unlock(userId: string): Promise<UserDto> {
    await this.users.update(
      { id: userId, status: 'LOCKED' },
      {
        status: () =>
          `CASE WHEN email_verified_at IS NOT NULL THEN 'ACTIVE' ELSE 'PENDING_VERIFICATION' END`,
        lockedAt: null,
        lockedBy: null,
        lockReason: null,
      },
    );
    const user = await this.users.findOneBy({ id: userId });
    if (!user) throw userNotFound();
    return UserDto.from(user);
  }
}
