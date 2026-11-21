import { GoogleLibraryVerifier } from './google-id-token.verifier';
import { IdentityError } from '../errors/identity.errors';

const CLIENT_ID = 'client-id.apps.googleusercontent.com';

/** `OAuth2Client` giả: chỉ `verifyIdToken`. */
const clientReturning = (payload: Record<string, unknown> | undefined) => ({
  verifyIdToken: jest.fn().mockResolvedValue({ getPayload: () => payload }),
});
const clientFailing = (err: unknown) => ({ verifyIdToken: jest.fn().mockRejectedValue(err) });

describe('GoogleLibraryVerifier', () => {
  it('gọi verifyIdToken với idToken và audience = GOOGLE_CLIENT_ID', async () => {
    const client = clientReturning({
      sub: 's',
      email: 'a@b.com',
      email_verified: true,
      name: 'An',
    });
    await new GoogleLibraryVerifier(CLIENT_ID, client as never).verify('the-token');
    expect(client.verifyIdToken).toHaveBeenCalledWith({
      idToken: 'the-token',
      audience: CLIENT_ID,
    });
  });

  it('trả sub, email, email_verified, name từ payload', async () => {
    const client = clientReturning({
      sub: 'google-sub',
      email: 'a@b.com',
      email_verified: true,
      name: 'An',
    });
    await expect(
      new GoogleLibraryVerifier(CLIENT_ID, client as never).verify('t'),
    ).resolves.toEqual({
      sub: 'google-sub',
      email: 'a@b.com',
      emailVerified: true,
      name: 'An',
    });
  });

  it('thiếu email trong payload -> email rỗng, emailVerified false (service sẽ từ chối)', async () => {
    const client = clientReturning({ sub: 'google-sub' });
    await expect(
      new GoogleLibraryVerifier(CLIENT_ID, client as never).verify('t'),
    ).resolves.toEqual({
      sub: 'google-sub',
      email: '',
      emailVerified: false,
      name: undefined,
    });
  });

  it.each([
    ['payload rỗng', undefined],
    ['payload thiếu sub', { email: 'a@b.com', email_verified: true }],
  ])('%s -> 401 IDENTITY_GOOGLE_TOKEN_INVALID', async (_n, payload) => {
    const client = clientReturning(payload);
    await expect(
      new GoogleLibraryVerifier(CLIENT_ID, client as never).verify('t'),
    ).rejects.toMatchObject({
      code: IdentityError.GOOGLE_TOKEN_INVALID,
      status: 401,
    });
  });

  it.each([
    'Wrong number of segments in token: abc',
    'Invalid token signature: abc',
    'Token used too late, 1 > 0',
    'Wrong recipient, payload audience != requiredAudience',
    'No pem found for envelope: {"alg":"RS256"}',
  ])('token hỏng (%s) -> 401 IDENTITY_GOOGLE_TOKEN_INVALID', async (message) => {
    const client = clientFailing(new Error(message));
    await expect(
      new GoogleLibraryVerifier(CLIENT_ID, client as never).verify('t'),
    ).rejects.toMatchObject({
      code: IdentityError.GOOGLE_TOKEN_INVALID,
      status: 401,
    });
  });

  it.each(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNRESET'])(
    'không tải được khóa Google (%s) -> 503 DEPENDENCY_UNAVAILABLE, KHÔNG nhầm với token sai',
    async (code) => {
      const client = clientFailing(Object.assign(new Error('network'), { code }));
      await expect(
        new GoogleLibraryVerifier(CLIENT_ID, client as never).verify('t'),
      ).rejects.toMatchObject({
        code: 'DEPENDENCY_UNAVAILABLE',
        status: 503,
      });
    },
  );

  it('lỗi HTTP từ máy chủ khóa Google (GaxiosError, có response) -> 503', async () => {
    const err = Object.assign(new Error('Request failed with status code 500'), {
      name: 'GaxiosError',
      response: { status: 500 },
    });
    await expect(
      new GoogleLibraryVerifier(CLIENT_ID, clientFailing(err) as never).verify('t'),
    ).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE', status: 503 });
  });

  it('thông điệp lỗi gốc (có thể chứa token) không lọt vào lỗi trả ra', async () => {
    const client = clientFailing(new Error('Invalid token signature: SECRET-TOKEN-VALUE'));
    const err = await new GoogleLibraryVerifier(CLIENT_ID, client as never)
      .verify('t')
      .catch((e: Error) => e);
    expect(JSON.stringify(err)).not.toContain('SECRET-TOKEN-VALUE');
    expect((err as Error).message).not.toContain('SECRET-TOKEN-VALUE');
  });
});
