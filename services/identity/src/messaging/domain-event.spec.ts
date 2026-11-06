import { buildDomainEvent, checkEnvelope } from './domain-event';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('buildDomainEvent', () => {
  it('dựng đủ envelope với giá trị mặc định', () => {
    const e = buildDomainEvent({
      eventType: 'rental.requested',
      payload: { reservationId: 'x' },
      producer: 'rental',
      correlationId: 'req-123',
    });
    expect(e.eventId).toMatch(UUID);
    expect(e).toMatchObject({
      eventType: 'rental.requested',
      version: 1,
      correlationId: 'req-123',
      producer: 'rental',
      payload: { reservationId: 'x' },
    });
    expect(new Date(e.occurredAt).toISOString()).toBe(e.occurredAt);
  });

  it('không có correlationId (job chạy nền) hoặc correlationId bẩn thì dùng eventId', () => {
    const a = buildDomainEvent({ eventType: 'rental.expired', payload: {}, producer: 'rental' });
    expect(a.correlationId).toBe(a.eventId);
    const b = buildDomainEvent({
      eventType: 'rental.expired',
      payload: {},
      producer: 'rental',
      correlationId: 'có dấu cách',
    });
    expect(b.correlationId).toBe(b.eventId);
  });

  it('từ chối eventType sai định dạng', () => {
    for (const bad of ['rental', 'Rental.Requested', 'rental.requested.v1', 'rental_requested']) {
      expect(() => buildDomainEvent({ eventType: bad, payload: {}, producer: 'rental' })).toThrow(
        /eventType/,
      );
    }
  });
});

describe('checkEnvelope', () => {
  const valid = buildDomainEvent({
    eventType: 'payment.deposited',
    payload: {},
    producer: 'payment',
  });

  it('envelope hợp lệ trả null, payload có trường lạ vẫn hợp lệ', () => {
    expect(checkEnvelope(valid)).toBeNull();
    expect(checkEnvelope({ ...valid, payload: { newField: 1 } })).toBeNull();
  });

  it.each([
    ['không phải object', 'abc'],
    ['mảng', []],
    ['eventId sai', { ...valid, eventId: '123' }],
    ['eventType sai', { ...valid, eventType: 'PAYMENT' }],
    ['version sai', { ...valid, version: 0 }],
    ['occurredAt sai', { ...valid, occurredAt: 'hôm qua' }],
    ['payload thiếu', { ...valid, payload: undefined }],
  ])('%s -> trả lý do', (_name, value) => {
    expect(checkEnvelope(value)).toEqual(expect.any(String));
  });
});
