import { DataSource } from 'typeorm';
import { StorageService } from '../../storage/storage.service';
import { ListingPresenter } from './listing.presenter';
import { ListingRow } from './listing.sql';

const row = (id: string): ListingRow => ({
  id,
  ownerId: 'owner-1',
  title: `Tin ${id}`,
  description: null,
  propertyType: 'ROOM',
  priceVnd: 3500000,
  depositAmountVnd: 3500000,
  areaM2: 25.5,
  address: '1 Đại Cồ Việt',
  district: 'Hai Bà Trưng',
  city: 'Hà Nội',
  amenities: ['WIFI'],
  lat: 21.0054,
  lng: 105.8431,
  status: 'AVAILABLE',
  approvalStatus: 'APPROVED',
  rejectReason: null,
  createdAt: new Date('2026-11-19T01:00:00.000Z'),
  updatedAt: new Date('2026-11-19T02:00:00.000Z'),
});

function make(images: Array<Record<string, unknown>>) {
  const query = jest.fn().mockResolvedValue(images);
  const presignGet = jest.fn(
    async (bucket: string, key: string) => `https://s3/${bucket}/${key}?sig`,
  );
  const presenter = new ListingPresenter(
    { query } as unknown as DataSource,
    { presignGet } as unknown as StorageService,
  );
  return { presenter, query, presignGet };
}

describe('ListingPresenter', () => {
  it('không có tin: trả [] và không truy vấn', async () => {
    const { presenter, query } = make([]);
    await expect(presenter.present([])).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('một truy vấn ảnh cho cả trang, gom ảnh về đúng tin, giữ thứ tự DB trả về', async () => {
    const { presenter, query } = make([
      { id: 'i1', listingId: 'a', objectKey: 'listings/a/1.png', sortOrder: 0 },
      { id: 'i2', listingId: 'b', objectKey: 'listings/b/1.png', sortOrder: 0 },
      { id: 'i3', listingId: 'a', objectKey: 'listings/a/2.png', sortOrder: 1 },
    ]);
    const [a, b, c] = await presenter.present([row('a'), row('b'), row('c')]);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([['a', 'b', 'c']]);
    expect(a.images.map((i) => i.id)).toEqual(['i1', 'i3']);
    expect(b.images.map((i) => i.id)).toEqual(['i2']);
    expect(c.images).toEqual([]);
  });

  it('url ảnh là presigned GET của bucket listing-images; không lộ object key hay trường nội bộ', async () => {
    const { presenter, presignGet } = make([
      { id: 'i1', listingId: 'a', objectKey: 'listings/a/1.png', sortOrder: 0 },
    ]);
    const [dto] = await presenter.present([row('a')]);
    expect(presignGet).toHaveBeenCalledWith('listing-images', 'listings/a/1.png');
    expect(dto.images).toEqual([
      { id: 'i1', url: 'https://s3/listing-images/listings/a/1.png?sig', sortOrder: 0 },
    ]);
    expect(JSON.stringify(dto)).not.toContain('objectKey');
  });

  it('thời gian ra ISO 8601 UTC; các trường khác giữ nguyên', async () => {
    const { presenter } = make([]);
    const [dto] = await presenter.present([row('a')]);
    expect(dto).toMatchObject({
      id: 'a',
      priceVnd: 3500000,
      lat: 21.0054,
      createdAt: '2026-11-19T01:00:00.000Z',
      updatedAt: '2026-11-19T02:00:00.000Z',
    });
  });
});
