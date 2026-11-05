import { createTestApp, TestApp } from './helpers/create-test-app';

describe('Swagger /api/docs', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp([], [], { swagger: true });
  });
  afterAll(async () => {
    await t.app.close();
  });

  it('/api/docs trả giao diện Swagger UI mà không cần token', async () => {
    const res = await t.http().get('/api/docs');
    expect(res.status).toBe(200);
    expect(res.text.toLowerCase()).toContain('swagger');
  });

  it('/api/docs-json mô tả API công khai, loại trừ /internal, có schema lỗi và bearer auth', async () => {
    const res = await t.http().get('/api/docs-json');
    expect(res.status).toBe(200);
    const doc = res.body;
    expect(doc.info.title).toBe('template-nest-test API');
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(['/api/v1/examples', '/api/v1/examples/{id}', '/api/v1/health']),
    );
    expect(Object.keys(doc.paths).some((p) => p.includes('/internal'))).toBe(false);
    expect(Object.keys(doc.components.schemas)).toEqual(
      expect.arrayContaining(['ExampleDto', 'CreateExampleDto', 'ErrorResponseDto']),
    );
    expect(doc.components.securitySchemes.bearer).toMatchObject({ type: 'http', scheme: 'bearer' });
  });

  it('tiền trong OpenAPI là integer, không phải number thập phân', async () => {
    const doc = (await t.http().get('/api/docs-json')).body;
    expect(doc.components.schemas.CreateExampleDto.properties.priceVnd.type).toBe('integer');
  });
});
