import { startIdentityInfra } from './helpers/identity-infra';
import type { IdentityInfra } from './helpers/identity-infra';

/**
 * Test 24 của `Component_Class_Design §5`, ở FILE RIÊNG: ConfigModule chốt biến môi trường lúc AppModule được
 * import (`standards/gotchas.md`), nên mỗi giá trị GOOGLE_CLIENT_ID cần một file test.
 */
describe('test 24: chưa cấu hình GOOGLE_CLIENT_ID', () => {
  let x: IdentityInfra;
  beforeAll(async () => {
    x = await startIdentityInfra({ env: { GOOGLE_CLIENT_ID: '' } });
  });
  afterAll(async () => {
    await x?.close();
  });

  it('service vẫn chạy (/health up); POST /auth/google -> 503 DEPENDENCY_UNAVAILABLE, kể cả token rác', async () => {
    expect((await x.t.http().get('/health')).status).toBe(200);
    const res = await x.t
      .http()
      .post('/api/v1/auth/google')
      .send({ idToken: 'rac', role: 'TENANT' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('DEPENDENCY_UNAVAILABLE');
  });

  it('log warn lúc khởi động nói rõ thiếu GOOGLE_CLIENT_ID', () => {
    const warn = x.t.logRecords().find((r) => String(r.msg).includes('GOOGLE_CLIENT_ID'));
    expect(warn).toBeDefined();
  });
});
