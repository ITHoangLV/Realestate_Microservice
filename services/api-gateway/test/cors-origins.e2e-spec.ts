import type { TestApp } from './helpers/create-test-app';

// ConfigModule chốt giá trị env lúc import AppModule (gotchas.md): đặt CORS_ORIGINS TRƯỚC khi import.
// Jest nạp lại module cho mỗi file test nên env này không rò sang file khác.
describe('CORS_ORIGINS đổi được, nhiều origin cách nhau dấu phẩy', () => {
  let t: TestApp;

  beforeAll(async () => {
    process.env.CORS_ORIGINS = 'https://app.example.com, http://localhost:4000';
    const { createTestApp } = await import('./helpers/create-test-app');
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.app.close();
    delete process.env.CORS_ORIGINS;
  });

  it.each(['https://app.example.com', 'http://localhost:4000'])('chấp nhận %s', async (origin) => {
    const res = await t.http().get('/health').set('Origin', origin);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
  });

  it('origin mặc định http://localhost:3000 không còn được chấp nhận khi đã cấu hình khác', async () => {
    const res = await t.http().get('/health').set('Origin', 'http://localhost:3000');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
