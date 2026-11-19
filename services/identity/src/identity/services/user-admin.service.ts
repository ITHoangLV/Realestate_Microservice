import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Paginated } from '../../common/response/response-meta';
import { ListUsersQuery } from '../dto/list-users.query';
import { UserDto } from '../dto/user.dto';
import { User } from '../entities/user.entity';

/** Thao tác quản trị trên người dùng. T2.1: danh sách; T2.5 thêm khóa, mở khóa. */
@Injectable()
export class UserAdminService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  /**
   * Danh sách người dùng cho quản trị viên (route 8). Đúng 2 truy vấn (data + count, do `findAndCount`).
   * Chỉ chọn cột của `UserDto`, không bao giờ đọc `password_hash`. Sắp `created_at DESC, id DESC`
   * (khóa phụ `id` để trang không trùng, không sót khi nhiều người cùng `created_at`); index
   * `IDX_users_created_at_id`, `IDX_users_role_created_at_id`. Trang vượt quá: `items` rỗng, `total` đúng.
   */
  async list(query: ListUsersQuery): Promise<Paginated<UserDto>> {
    const [rows, total] = await this.users.findAndCount({
      select: { id: true, email: true, fullName: true, role: true, createdAt: true },
      where: query.role ? { role: query.role } : {},
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: query.skip,
      take: query.pageSize,
    });
    return new Paginated(rows.map(UserDto.from), query.page, query.pageSize, total);
  }
}
