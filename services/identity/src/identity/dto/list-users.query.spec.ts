import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListUsersQuery } from './list-users.query';

async function parse(plain: Record<string, unknown>) {
  const dto = plainToInstance(ListUsersQuery, plain);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, fields: errors.map((e) => e.property) };
}

describe('ListUsersQuery', () => {
  it('mặc định: page=1, pageSize=20, không lọc role', async () => {
    const { dto, fields } = await parse({});
    expect(fields).toEqual([]);
    expect(dto).toMatchObject({ page: 1, pageSize: 20 });
    expect(dto.role).toBeUndefined();
  });

  it.each(['TENANT', 'LANDLORD', 'ADMIN'])('chấp nhận role=%s', async (role) => {
    const { dto, fields } = await parse({ role });
    expect(fields).toEqual([]);
    expect(dto.role).toBe(role);
  });

  it.each(['SUPERUSER', 'tenant', '', 'ADMIN '])('từ chối role="%s"', async (role) => {
    expect((await parse({ role })).fields).toContain('role');
  });

  it('kế thừa luật phân trang: pageSize 51 và page 0 bị từ chối, 50 và 1 hợp lệ', async () => {
    expect((await parse({ pageSize: '51' })).fields).toContain('pageSize');
    expect((await parse({ page: '0' })).fields).toContain('page');
    expect((await parse({ page: '1', pageSize: '50' })).fields).toEqual([]);
  });

  it('từ chối tham số lạ', async () => {
    expect((await parse({ sort: 'email' })).fields).toContain('sort');
  });

  it('skip kế thừa từ PageQueryDto', async () => {
    expect((await parse({ page: '3', pageSize: '10' })).dto.skip).toBe(20);
  });
});
