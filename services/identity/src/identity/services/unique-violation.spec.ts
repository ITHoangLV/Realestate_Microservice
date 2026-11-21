import { QueryFailedError } from 'typeorm';
import { uniqueViolationConstraint } from './unique-violation';

const pgError = (driver: Record<string, unknown>) =>
  new QueryFailedError('INSERT', [], Object.assign(new Error('x'), driver));

describe('uniqueViolationConstraint', () => {
  it('23505 có tên ràng buộc -> trả tên đó', () => {
    expect(
      uniqueViolationConstraint(pgError({ code: '23505', constraint: 'UQ_users_phone' })),
    ).toBe('UQ_users_phone');
  });

  it('23505 không có tên -> chuỗi rỗng (vẫn là vi phạm duy nhất)', () => {
    expect(uniqueViolationConstraint(pgError({ code: '23505' }))).toBe('');
  });

  it('lỗi DB khác, lỗi thường, giá trị lạ -> undefined', () => {
    expect(uniqueViolationConstraint(pgError({ code: '23503', constraint: 'FK' }))).toBeUndefined();
    expect(uniqueViolationConstraint(new Error('x'))).toBeUndefined();
    expect(uniqueViolationConstraint(null)).toBeUndefined();
  });
});
