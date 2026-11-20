import { isUniqueViolation, listingColumns, pointSql, rowsOf } from './listing.sql';

describe('rowsOf (kết quả query của TypeORM + Postgres)', () => {
  it('SELECT và INSERT ... RETURNING trả thẳng mảng dòng', () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    expect(rowsOf(rows)).toBe(rows);
    expect(rowsOf([])).toEqual([]);
  });

  it('UPDATE/DELETE ... RETURNING trả [dòng, số dòng bị ảnh hưởng]: lấy phần dòng', () => {
    expect(rowsOf([[{ id: 'a' }], 1])).toEqual([{ id: 'a' }]);
    expect(rowsOf([[], 0])).toEqual([]);
  });

  it('hai dòng SELECT không bị nhầm với dạng [dòng, số]', () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    expect(rowsOf(rows)).toEqual(rows);
  });
});

describe('isUniqueViolation', () => {
  it('nhận mã 23505 từ driverError (QueryFailedError) hoặc từ chính lỗi pg', () => {
    expect(isUniqueViolation({ driverError: { code: '23505' } })).toBe(true);
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });

  it('mã khác, lỗi thường, null: không phải', () => {
    expect(isUniqueViolation({ driverError: { code: '23503' } })).toBe(false);
    expect(isUniqueViolation(new Error('x'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

describe('pointSql, listingColumns', () => {
  it('ST_MakePoint nhận (kinh độ, vĩ độ) đúng thứ tự và ép sang geography', () => {
    expect(pointSql('$1', '$2')).toBe('ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography');
  });

  it('listingColumns dùng đúng bí danh bảng, đọc lat/lng từ location, không lộ cột nội bộ', () => {
    const sql = listingColumns('l');
    expect(sql).toContain('ST_Y(l.location::geometry) AS lat');
    expect(sql).toContain('ST_X(l.location::geometry) AS lng');
    expect(sql).toContain('l.price_vnd::float8 AS "priceVnd"');
    for (const hidden of [
      'version',
      'held_until',
      'held_by_deposit_id',
      'reviewed_by',
      'deleted_at',
    ]) {
      expect(sql).not.toContain(hidden);
    }
  });
});
