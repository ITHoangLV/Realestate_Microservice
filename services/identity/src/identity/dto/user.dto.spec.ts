import { UserDto } from './user.dto';
import type { User } from '../entities/user.entity';

const row = {
  id: '0b0a8b5e-7f9e-4c3a-9d2a-2f5f4b9c1a11',
  email: 'a@example.com',
  fullName: 'An',
  role: 'TENANT',
  status: 'PENDING_VERIFICATION',
  phone: null,
  createdAt: new Date('2026-11-20T10:00:00.000Z'),
} as const;

describe('UserDto.from (API_Spec §1.12)', () => {
  it('có đúng bảy trường, status và phone (null khi chưa khai)', () => {
    expect(UserDto.from(row)).toEqual({
      id: row.id,
      email: 'a@example.com',
      fullName: 'An',
      role: 'TENANT',
      status: 'PENDING_VERIFICATION',
      phone: null,
      createdAt: '2026-11-20T10:00:00.000Z',
    });
  });

  it('giữ nguyên số điện thoại đã khai', () => {
    expect(UserDto.from({ ...row, phone: '0912345678' }).phone).toBe('0912345678');
  });

  it('danh sách trắng: cột nhạy cảm của entity không lọt ra response', () => {
    const entity = {
      ...row,
      passwordHash: '$argon2id$x',
      emailVerifiedAt: new Date(),
      lockedAt: new Date(),
      lockedBy: 'admin-id',
      lockReason: 'vi phạm',
    } as unknown as User;
    const keys = Object.keys(UserDto.from(entity)).sort();
    expect(keys).toEqual(['createdAt', 'email', 'fullName', 'id', 'phone', 'role', 'status']);
  });
});
