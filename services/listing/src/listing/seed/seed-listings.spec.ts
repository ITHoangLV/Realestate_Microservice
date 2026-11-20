import {
  AMENITIES,
  APPROVAL_STATUSES,
  LISTING_STATUSES,
  PROPERTY_TYPES,
} from '../entities/listing.enums';
import { SEED_LISTINGS, SEED_OWNER_IDS } from './seed-listings.data';

/** Điểm tìm kiếm dùng trong DoD T2.4 và Postman/k6: `ST_MakePoint(105.84, 21.00)`. */
const CENTER = { lat: 21.0, lng: 105.84 };

/** Khoảng cách haversine (mét), tính độc lập với PostGIS. */
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371008.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const km = (l: { lat: number; lng: number }) =>
  haversineM(CENTER.lat, CENTER.lng, l.lat, l.lng) / 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const searchable = SEED_LISTINGS.filter(
  (l) => l.approvalStatus === 'APPROVED' && l.status === 'AVAILABLE',
);

describe('SEED_LISTINGS: dữ liệu seed', () => {
  it('có đúng 30 tin, id duy nhất theo quy ước c0000000-…-0000000000NN', () => {
    expect(SEED_LISTINGS).toHaveLength(30);
    const ids = SEED_LISTINGS.map((l) => l.id);
    expect(new Set(ids).size).toBe(30);
    ids.forEach((id, i) => {
      expect(id).toMatch(UUID);
      expect(id).toBe(`c0000000-0000-4000-8000-0000000000${String(i + 1).padStart(2, '0')}`);
    });
  });

  it('chủ sở hữu là một trong 3 chủ trọ seed của identity, mỗi người có ít nhất 8 tin', () => {
    expect(SEED_OWNER_IDS).toEqual([
      'a0000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000002',
      'a0000000-0000-4000-8000-000000000003',
    ]);
    for (const owner of SEED_OWNER_IDS) {
      expect(SEED_LISTINGS.filter((l) => l.ownerId === owner).length).toBeGreaterThanOrEqual(8);
    }
    for (const l of SEED_LISTINGS) expect(SEED_OWNER_IDS).toContain(l.ownerId);
  });

  it('giá trị enum và tiện ích hợp lệ, tiện ích không trùng', () => {
    for (const l of SEED_LISTINGS) {
      expect(PROPERTY_TYPES).toContain(l.propertyType);
      expect(LISTING_STATUSES).toContain(l.status);
      expect(APPROVAL_STATUSES).toContain(l.approvalStatus);
      for (const a of l.amenities) expect(AMENITIES).toContain(a);
      expect(new Set(l.amenities).size).toBe(l.amenities.length);
    }
  });

  it('giới hạn trường theo DDL: title ≤ 200, address ≤ 300, district/city ≤ 100, description ≤ 5000', () => {
    for (const l of SEED_LISTINGS) {
      expect(l.title.length).toBeGreaterThan(0);
      expect(l.title.length).toBeLessThanOrEqual(200);
      expect(l.address.length).toBeGreaterThan(0);
      expect(l.address.length).toBeLessThanOrEqual(300);
      expect(l.district.length).toBeLessThanOrEqual(100);
      expect(l.city).toBe('Hà Nội');
      expect(l.description.length).toBeLessThanOrEqual(5000);
    }
  });

  it('tiền: giá > 0, cọc > 0 và cọc ≤ giá, đều là số nguyên; diện tích trong (0, 999999.99]', () => {
    for (const l of SEED_LISTINGS) {
      expect(Number.isInteger(l.priceVnd)).toBe(true);
      expect(Number.isInteger(l.depositAmountVnd)).toBe(true);
      expect(l.priceVnd).toBeGreaterThan(0);
      expect(l.depositAmountVnd).toBeGreaterThan(0);
      expect(l.depositAmountVnd).toBeLessThanOrEqual(l.priceVnd);
      expect(l.areaM2).toBeGreaterThan(0);
      expect(l.areaM2).toBeLessThanOrEqual(999999.99);
    }
  });

  it('tọa độ nằm trong khung Hà Nội', () => {
    for (const l of SEED_LISTINGS) {
      expect(l.lat).toBeGreaterThan(20.85);
      expect(l.lat).toBeLessThan(21.25);
      expect(l.lng).toBeGreaterThan(105.65);
      expect(l.lng).toBeLessThan(106.05);
    }
  });

  it('tọa độ không trùng nhau (mỗi tin là một căn/phòng riêng)', () => {
    const keys = SEED_LISTINGS.map((l) => `${l.lat},${l.lng}`);
    expect(new Set(keys).size).toBe(30);
  });
});

describe('SEED_LISTINGS: cơ cấu trạng thái (A duyệt 2026-11-20)', () => {
  const count = (status: string, approval: string) =>
    SEED_LISTINGS.filter((l) => l.status === status && l.approvalStatus === approval).length;

  it('24 AVAILABLE+APPROVED, 3 PENDING_REVIEW, 1 REJECTED, 1 HIDDEN, 1 RENTED', () => {
    expect(count('AVAILABLE', 'APPROVED')).toBe(24);
    expect(count('AVAILABLE', 'PENDING_REVIEW')).toBe(3);
    expect(count('AVAILABLE', 'REJECTED')).toBe(1);
    expect(count('HIDDEN', 'APPROVED')).toBe(1);
    expect(count('RENTED', 'APPROVED')).toBe(1);
  });

  it('không có HELD, DEPOSITED (cần đơn đặt cọc thật)', () => {
    expect(SEED_LISTINGS.some((l) => l.status === 'HELD' || l.status === 'DEPOSITED')).toBe(false);
  });

  it('tin REJECTED có lý do 1–500 ký tự; các tin khác không có', () => {
    for (const l of SEED_LISTINGS) {
      if (l.approvalStatus === 'REJECTED') {
        expect(l.rejectReason?.length).toBeGreaterThanOrEqual(1);
        expect(l.rejectReason?.length).toBeLessThanOrEqual(500);
      } else {
        expect(l.rejectReason).toBeUndefined();
      }
    }
  });
});

describe('SEED_LISTINGS: phân bố quanh (21.00, 105.84) cho EXPLAIN, tìm kiếm, k6', () => {
  it('ít nhất 10 tin AVAILABLE+APPROVED trong 2 km', () => {
    expect(searchable.filter((l) => km(l) <= 2).length).toBeGreaterThanOrEqual(10);
  });

  it('có 2–3 tin AVAILABLE+APPROVED trong khoảng 2,1–3 km', () => {
    const band = searchable.filter((l) => km(l) >= 2.1 && km(l) <= 3);
    expect(band.length).toBeGreaterThanOrEqual(2);
    expect(band.length).toBeLessThanOrEqual(3);
  });

  it('có ít nhất 1 tin PENDING_REVIEW và 1 tin HIDDEN trong 2 km (bộ lọc phải loại chúng)', () => {
    const within = SEED_LISTINGS.filter((l) => km(l) <= 2);
    expect(within.some((l) => l.approvalStatus === 'PENDING_REVIEW')).toBe(true);
    expect(within.some((l) => l.status === 'HIDDEN')).toBe(true);
  });

  it('không tin nào sát ranh 2 km hoặc 3 km (±50 m) để kết quả không phụ thuộc cách tính khoảng cách', () => {
    for (const l of SEED_LISTINGS) {
      expect(Math.abs(km(l) - 2)).toBeGreaterThan(0.05);
      expect(Math.abs(km(l) - 3)).toBeGreaterThan(0.05);
    }
  });

  it('có tin ở xa (> 5 km) để phủ nhiều quận', () => {
    expect(SEED_LISTINGS.filter((l) => km(l) > 5).length).toBeGreaterThanOrEqual(3);
    expect(new Set(SEED_LISTINGS.map((l) => l.district)).size).toBeGreaterThanOrEqual(6);
  });
});
