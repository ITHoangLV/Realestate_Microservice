import { randomUUID } from 'node:crypto';
import { Paginated } from '../../common/response/response-meta';
import { ListUsersQuery } from '../dto/list-users.query';
import { UserAdminService } from './user-admin.service';

/** Repository giả: ghi lại tham số findAndCount, trả dòng cho sẵn. */
class FakeRepo {
  calls: Array<Record<string, unknown>> = [];
  rows: Array<Record<string, unknown>> = [];
  total = 0;
  async findAndCount(options: Record<string, unknown>) {
    this.calls.push(options);
    return [this.rows, this.total] as const;
  }
}

const query = (over: Partial<ListUsersQuery> = {}): ListUsersQuery =>
  Object.assign(new ListUsersQuery(), over);

describe('UserAdminService.list', () => {
  let repo: FakeRepo;
  let service: UserAdminService;

  beforeEach(() => {
    repo = new FakeRepo();
    service = new UserAdminService(repo as never, {} as never);
  });

  it('một lần findAndCount: sắp createdAt DESC, id DESC; skip/take theo trang; chỉ select cột của UserDto', async () => {
    await service.list(query({ page: 3, pageSize: 10 }));

    expect(repo.calls).toHaveLength(1);
    expect(repo.calls[0]).toEqual({
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        phone: true,
        createdAt: true,
      },
      where: {},
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: 20,
      take: 10,
    });
  });

  it('không bao giờ select password_hash', async () => {
    await service.list(query());
    const select = repo.calls[0].select as Record<string, boolean>;
    expect(select.passwordHash).toBeUndefined();
    expect(Object.keys(select).sort()).toEqual([
      'createdAt',
      'email',
      'fullName',
      'id',
      'phone',
      'role',
      'status',
    ]);
  });

  it('lọc role thì đưa vào where', async () => {
    await service.list(query({ role: 'LANDLORD' }));
    expect(repo.calls[0].where).toEqual({ role: 'LANDLORD' });
  });

  it('trả Paginated: items là UserDto dựng từng trường, kèm page, pageSize, total', async () => {
    const id = randomUUID();
    repo.rows = [
      {
        id,
        email: 'an@example.com',
        fullName: 'Nguyễn Văn An',
        role: 'TENANT',
        createdAt: new Date('2026-11-19T03:00:00.000Z'),
        passwordHash: 'khong-duoc-lo', // dù repo có lỡ trả về cũng không được ra ngoài
      },
    ];
    repo.total = 41;

    const page = await service.list(query({ page: 2, pageSize: 20 }));

    expect(page).toBeInstanceOf(Paginated);
    expect(page.page).toBe(2);
    expect(page.pageSize).toBe(20);
    expect(page.total).toBe(41);
    expect(page.items).toEqual([
      {
        id,
        email: 'an@example.com',
        fullName: 'Nguyễn Văn An',
        role: 'TENANT',
        createdAt: '2026-11-19T03:00:00.000Z',
      },
    ]);
  });

  it('trang vượt quá: items rỗng nhưng total vẫn đúng', async () => {
    repo.rows = [];
    repo.total = 6;
    const page = await service.list(query({ page: 9, pageSize: 20 }));
    expect(page.items).toEqual([]);
    expect(page.total).toBe(6);
    expect(page.page).toBe(9);
  });
});
