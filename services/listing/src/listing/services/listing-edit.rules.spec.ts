import { classifyEdit, EditClassification, resubmits } from './listing-edit.rules';
import { ApprovalStatus } from '../entities/listing.enums';

const current = {
  title: 'Phòng 25m2 gần ĐH Bách Khoa',
  description: 'Sạch sẽ',
  propertyType: 'ROOM',
  priceVnd: 3000000,
  depositAmountVnd: 3000000,
  areaM2: 25,
  address: '1 Đại Cồ Việt',
  district: 'Hai Bà Trưng',
  city: 'Hà Nội',
  amenities: ['WIFI', 'FRIDGE'],
  lat: 21.0054,
  lng: 105.8431,
} as const;

describe('classifyEdit', () => {
  it('body trống hoặc gửi lại đúng giá trị cũ: không đổi gì', () => {
    expect(classifyEdit(current, {})).toEqual({ changed: [], display: false });
    expect(classifyEdit(current, { title: current.title, priceVnd: 3000000 })).toEqual({
      changed: [],
      display: false,
    });
  });

  it.each([
    ['title', { title: 'Phòng mới' }],
    ['description', { description: 'Mô tả khác' }],
    ['propertyType', { propertyType: 'HOUSE' }],
    ['address', { address: '2 Tạ Quang Bửu' }],
    ['district', { district: 'Cầu Giấy' }],
    ['city', { city: 'Hồ Chí Minh' }],
    ['lat', { lat: 21.01, lng: 105.8431 }],
    ['lng', { lat: 21.0054, lng: 105.9 }],
  ])('đổi %s là đổi nội dung hiển thị', (field, patch) => {
    const result = classifyEdit(current, patch);
    expect(result.changed).toContain(field);
    expect(result.display).toBe(true);
  });

  it.each([
    ['priceVnd', { priceVnd: 3500000 }],
    ['depositAmountVnd', { depositAmountVnd: 4000000 }],
    ['areaM2', { areaM2: 30 }],
    ['amenities', { amenities: ['WIFI', 'PARKING'] }],
  ])('đổi %s không phải nội dung hiển thị', (field, patch) => {
    expect(classifyEdit(current, patch)).toEqual({ changed: [field], display: false });
  });

  it('amenities cùng tập, khác thứ tự: coi như không đổi', () => {
    expect(classifyEdit(current, { amenities: ['FRIDGE', 'WIFI'] })).toEqual({
      changed: [],
      display: false,
    });
  });

  it('description từ không có sang có là đổi; description null vs chuỗi rỗng là không đổi', () => {
    expect(classifyEdit({ ...current, description: null }, { description: 'Mới' }).display).toBe(
      true,
    );
    expect(classifyEdit({ ...current, description: null }, { description: '' }).changed).toEqual(
      [],
    );
  });

  it('nhiều trường: liệt kê đủ, display true nếu có một trường hiển thị', () => {
    const result = classifyEdit(current, { priceVnd: 1, title: 'X'.repeat(6) });
    expect(result.changed.sort()).toEqual(['priceVnd', 'title']);
    expect(result.display).toBe(true);
  });
});

describe('resubmits (bảng RE.LISTING/API_Spec.md §1.1)', () => {
  const none: EditClassification = { changed: [], display: false };
  const priceOnly: EditClassification = { changed: ['priceVnd'], display: false };
  const title: EditClassification = { changed: ['title'], display: true };

  const cases: Array<[ApprovalStatus, EditClassification, boolean]> = [
    ['APPROVED', title, true],
    ['APPROVED', priceOnly, false],
    ['APPROVED', none, false],
    ['REJECTED', title, true],
    ['REJECTED', priceOnly, true], // tin REJECTED: bất kỳ trường nào cũng nộp lại
    ['REJECTED', none, false],
    ['PENDING_REVIEW', title, false],
    ['PENDING_REVIEW', priceOnly, false],
  ];

  it.each(cases)('%s + %j → về PENDING_REVIEW: %s', (approval, edit, expected) => {
    expect(resubmits(approval, edit)).toBe(expected);
  });

  it('thêm ảnh (route 8) tính như đổi nội dung hiển thị', () => {
    const addImage = { changed: ['images'], display: true };
    expect(resubmits('APPROVED', addImage)).toBe(true);
    expect(resubmits('REJECTED', addImage)).toBe(true);
    expect(resubmits('PENDING_REVIEW', addImage)).toBe(false);
  });
});
