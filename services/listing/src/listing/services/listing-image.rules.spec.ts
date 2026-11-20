import { randomUUID } from 'node:crypto';
import { buildImageKey, checkUploadedImage, isKeyOfListing } from './listing-image.rules';

const listingId = '0b0a8b5e-7f9e-4c3a-9d2a-2f5f4b9c1a11';
const limits = { maxBytes: 5 * 1024 * 1024, types: ['image/jpeg', 'image/png', 'image/webp'] };

describe('buildImageKey', () => {
  it.each([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
  ])('%s → listings/{id}/{uuid}.%s', (type, ext) => {
    const key = buildImageKey(listingId, type);
    expect(key).toMatch(new RegExp(`^listings/${listingId}/[0-9a-f-]{36}\\.${ext}$`));
  });

  it('loại khác lấy phần sau "image/" làm đuôi; mỗi lần gọi một key mới', () => {
    expect(buildImageKey(listingId, 'image/avif')).toMatch(/\.avif$/);
    expect(buildImageKey(listingId, 'image/png')).not.toBe(buildImageKey(listingId, 'image/png'));
  });
});

describe('isKeyOfListing: key client gửi lên có đúng là key service đã đặt cho tin này không', () => {
  it('key do buildImageKey sinh ra thì hợp lệ', () => {
    expect(isKeyOfListing(listingId, buildImageKey(listingId, 'image/png'))).toBe(true);
  });

  it.each([
    ['tin khác', `listings/${randomUUID()}/${randomUUID()}.png`],
    ['không có tiền tố', `${randomUUID()}.png`],
    ['path traversal', `listings/${listingId}/../${randomUUID()}.png`],
    ['thêm thư mục con', `listings/${listingId}/a/${randomUUID()}.png`],
    ['tên không phải uuid', `listings/${listingId}/anh-cua-toi.png`],
    ['không có đuôi', `listings/${listingId}/${randomUUID()}`],
    ['đuôi quá dài', `listings/${listingId}/${randomUUID()}.abcdefgh`],
    ['đuôi viết hoa', `listings/${listingId}/${randomUUID()}.PNG`],
    ['rỗng', ''],
  ])('%s → không hợp lệ', (_name, key) => {
    expect(isKeyOfListing(listingId, key)).toBe(false);
  });
});

describe('checkUploadedImage (kết quả HeadObject)', () => {
  it('đúng loại, đúng cỡ → null (hợp lệ)', () => {
    expect(
      checkUploadedImage({ contentLength: 1024, contentType: 'image/png' }, limits),
    ).toBeNull();
  });

  it('đúng bằng giới hạn vẫn hợp lệ', () => {
    expect(
      checkUploadedImage({ contentLength: limits.maxBytes, contentType: 'image/jpeg' }, limits),
    ).toBeNull();
  });

  it('không có object → NOT_FOUND', () => {
    expect(checkUploadedImage(null, limits)).toBe('NOT_FOUND');
  });

  it('quá cỡ → TOO_LARGE', () => {
    expect(
      checkUploadedImage({ contentLength: limits.maxBytes + 1, contentType: 'image/png' }, limits),
    ).toBe('TOO_LARGE');
  });

  it('file rỗng → EMPTY', () => {
    expect(checkUploadedImage({ contentLength: 0, contentType: 'image/png' }, limits)).toBe(
      'EMPTY',
    );
  });

  it.each([['text/html'], [undefined], ['image/gif']])(
    'Content-Type %s không thuộc danh sách → TYPE_NOT_ALLOWED',
    (contentType) => {
      expect(checkUploadedImage({ contentLength: 10, contentType }, limits)).toBe(
        'TYPE_NOT_ALLOWED',
      );
    },
  );

  it('Content-Type có tham số (image/png; charset=x) vẫn so theo loại chính', () => {
    expect(
      checkUploadedImage({ contentLength: 10, contentType: 'image/png; charset=binary' }, limits),
    ).toBeNull();
  });
});
