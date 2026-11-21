import { QueryFailedError } from 'typeorm';
import { GoogleAuthService } from './google-auth.service';
import type { GoogleIdentity } from './google-id-token.verifier';
import { IdentityError } from '../errors/identity.errors';
import type { User } from '../entities/user.entity';

const SUB = 'google-sub-123';
const GOOGLE: GoogleIdentity = {
  sub: SUB,
  email: 'An@Example.com',
  emailVerified: true,
  name: 'Nguyễn Văn An',
};
const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'an@example.com',
  fullName: 'Nguyễn Văn An',
  role: 'TENANT',
  status: 'ACTIVE',
  passwordHash: 'hash',
} as User;
const TOKENS = { accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 900 };

interface Setup {
  google?: Partial<GoogleIdentity> | Error;
  linked?: boolean; // đã có user_identities (google, sub)
  userByEmail?: User | null;
  userById?: User | null;
  clientId?: string | undefined;
}

function setup(opts: Setup = {}) {
  const verifier = {
    verify:
      opts.google instanceof Error
        ? jest.fn().mockRejectedValue(opts.google)
        : jest.fn().mockResolvedValue({ ...GOOGLE, ...opts.google }),
  };
  const users = {
    findOne: jest.fn().mockResolvedValue(opts.userByEmail ?? null),
    findOneBy: jest.fn().mockResolvedValue('userById' in opts ? opts.userById : USER),
  };
  const identities = {
    findOne: jest.fn().mockResolvedValue(opts.linked ? { userId: USER.id } : null),
  };
  const manager = {
    save: jest.fn(async (_entity: unknown, data: Record<string, unknown>) => ({
      id: USER.id,
      ...data,
    })),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const dataSource = { transaction: jest.fn(async (cb: (m: unknown) => unknown) => cb(manager)) };
  const outbox = { add: jest.fn().mockResolvedValue({}) };
  const auth = { issueSession: jest.fn().mockResolvedValue(TOKENS) };
  const logger = { setContext: jest.fn(), warn: jest.fn(), info: jest.fn() };
  const clientId = 'clientId' in opts ? opts.clientId : 'client-id.apps.googleusercontent.com';
  const service = new GoogleAuthService(
    users as never,
    identities as never,
    dataSource as never,
    outbox as never,
    auth as never,
    verifier,
    { clientId },
    logger as never,
  );
  return { service, verifier, users, identities, manager, dataSource, outbox, auth, logger };
}

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'khong-loi',
    (e: { code?: string }) => e.code,
  );

describe('GoogleAuthService.login', () => {
  it('test 24: GOOGLE_CLIENT_ID không đặt -> 503 DEPENDENCY_UNAVAILABLE TRƯỚC khi kiểm token', async () => {
    const { service, verifier } = setup({ clientId: undefined });
    await expect(service.login('id-token')).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
      status: 503,
    });
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('khởi động không có GOOGLE_CLIENT_ID: log warn một lần; có thì không log', () => {
    const none = setup({ clientId: undefined });
    none.service.onModuleInit();
    expect(none.logger.warn).toHaveBeenCalledTimes(1);

    const has = setup();
    has.service.onModuleInit();
    expect(has.logger.warn).not.toHaveBeenCalled();
  });

  describe('token không hợp lệ (dòng 1, 2)', () => {
    it('verifier báo token sai -> chuyển nguyên lỗi 401 IDENTITY_GOOGLE_TOKEN_INVALID, không chạm DB', async () => {
      const err = Object.assign(new Error('x'), { code: IdentityError.GOOGLE_TOKEN_INVALID });
      const { service, users, identities } = setup({ google: err });
      await expect(service.login('bad')).rejects.toBe(err);
      expect(users.findOne).not.toHaveBeenCalled();
      expect(identities.findOne).not.toHaveBeenCalled();
    });

    it('Google không phản hồi (503 của verifier) -> chuyển nguyên', async () => {
      const err = Object.assign(new Error('x'), { code: 'DEPENDENCY_UNAVAILABLE', status: 503 });
      const { service } = setup({ google: err });
      await expect(service.login('t')).rejects.toBe(err);
    });

    it.each([
      ['email_verified = false', { emailVerified: false }],
      ['thiếu email', { email: '' }],
    ])(
      '%s -> 401 IDENTITY_GOOGLE_TOKEN_INVALID (Bảng 2.6: bắt buộc có email)',
      async (_n, over) => {
        const { service, identities } = setup({ google: over });
        expect(await codeOf(service.login('t', 'TENANT'))).toBe(IdentityError.GOOGLE_TOKEN_INVALID);
        expect(identities.findOne).not.toHaveBeenCalled();
      },
    );
  });

  describe('đã liên kết (dòng 3)', () => {
    it('lấy user đã liên kết, cấp phiên; KHÔNG ghi gì, không tra theo email', async () => {
      const { service, manager, users, auth } = setup({ linked: true });
      await expect(service.login('t')).resolves.toBe(TOKENS);
      expect(users.findOneBy).toHaveBeenCalledWith({ id: USER.id });
      expect(users.findOne).not.toHaveBeenCalled();
      expect(manager.save).not.toHaveBeenCalled();
      expect(auth.issueSession).toHaveBeenCalledWith(expect.objectContaining({ id: USER.id }));
    });

    it('dòng 7: user đã liên kết nhưng bị khóa -> 403 IDENTITY_ACCOUNT_LOCKED, không cấp phiên', async () => {
      const { service, auth } = setup({
        linked: true,
        userById: { ...USER, status: 'LOCKED' } as User,
      });
      expect(await codeOf(service.login('t'))).toBe(IdentityError.ACCOUNT_LOCKED);
      expect(auth.issueSession).not.toHaveBeenCalled();
    });

    it('liên kết trỏ tới user đã bị xóa -> 401 IDENTITY_GOOGLE_TOKEN_INVALID', async () => {
      const { service } = setup({ linked: true, userById: null });
      expect(await codeOf(service.login('t'))).toBe(IdentityError.GOOGLE_TOKEN_INVALID);
    });
  });

  describe('chưa liên kết, email đã có tài khoản (dòng 4)', () => {
    it('tài khoản ACTIVE: chỉ INSERT user_identities, giữ nguyên vai trò và mật khẩu', async () => {
      const { service, manager, auth } = setup({ userByEmail: USER });
      await service.login('t', 'LANDLORD'); // role trong body bị bỏ qua khi đã có tài khoản

      expect(manager.save).toHaveBeenCalledTimes(1);
      expect(manager.save).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ userId: USER.id, provider: 'google', providerUserId: SUB }),
      );
      expect(manager.update).not.toHaveBeenCalled();
      expect(auth.issueSession).toHaveBeenCalledWith(
        expect.objectContaining({ id: USER.id, role: 'TENANT' }),
      );
    });

    it('test 21: tài khoản PENDING_VERIFICATION -> ACTIVE, email_verified_at, XÓA password_hash (cùng transaction)', async () => {
      const pending = { ...USER, status: 'PENDING_VERIFICATION' } as User;
      const { service, manager, dataSource } = setup({ userByEmail: pending });
      await service.login('t');

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.update).toHaveBeenCalledTimes(1);
      const [, where, set] = manager.update.mock.calls[0];
      expect(where).toEqual({ id: USER.id, status: 'PENDING_VERIFICATION' });
      expect(set.status).toBe('ACTIVE');
      expect(set.passwordHash).toBeNull();
      expect(typeof set.emailVerifiedAt).toBe('function');
    });

    it('dòng 7: tài khoản bị khóa -> 403, KHÔNG liên kết, không cấp phiên', async () => {
      const { service, manager, auth } = setup({
        userByEmail: { ...USER, status: 'LOCKED' } as User,
      });
      expect(await codeOf(service.login('t'))).toBe(IdentityError.ACCOUNT_LOCKED);
      expect(manager.save).not.toHaveBeenCalled();
      expect(auth.issueSession).not.toHaveBeenCalled();
    });

    it('email của Google khác hoa thường vẫn khớp (tra theo lower(email))', async () => {
      const { service, users } = setup({ userByEmail: USER });
      await service.login('t');
      expect(users.findOne).toHaveBeenCalledTimes(1);
    });

    it('liên kết đồng thời (23505 trên user_identities): đọc lại liên kết thắng và cấp phiên, không lỗi', async () => {
      const { service, dataSource, identities, auth } = setup({ userByEmail: USER });
      dataSource.transaction.mockRejectedValueOnce(
        new QueryFailedError('INSERT', [], Object.assign(new Error('dup'), { code: '23505' })),
      );
      identities.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ userId: USER.id });

      await expect(service.login('t')).resolves.toBe(TOKENS);
      expect(auth.issueSession).toHaveBeenCalledTimes(1);
    });

    it('test 21a: tài khoản đã liên kết sub Google khác (UQ_user_identities_user_provider cả hai lần) -> 401, không cấp phiên', async () => {
      const { service, dataSource, auth } = setup({ userByEmail: USER });
      const dup = () =>
        new QueryFailedError(
          'INSERT',
          [],
          Object.assign(new Error('dup'), {
            code: '23505',
            constraint: 'UQ_user_identities_user_provider',
          }),
        );
      dataSource.transaction.mockRejectedValueOnce(dup()).mockRejectedValueOnce(dup());

      expect(await codeOf(service.login('t'))).toBe(IdentityError.GOOGLE_TOKEN_INVALID);
      expect(dataSource.transaction).toHaveBeenCalledTimes(2); // thử lại đúng một lần
      expect(auth.issueSession).not.toHaveBeenCalled();
    });

    it('UQ_user_identities_user_provider ở lần ĐẦU (đua cùng sub): thử lại, đọc được liên kết, 200', async () => {
      const { service, dataSource, identities, auth } = setup({ userByEmail: USER });
      dataSource.transaction.mockRejectedValueOnce(
        new QueryFailedError(
          'INSERT',
          [],
          Object.assign(new Error('dup'), {
            code: '23505',
            constraint: 'UQ_user_identities_user_provider',
          }),
        ),
      );
      identities.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ userId: USER.id });

      await expect(service.login('t')).resolves.toBe(TOKENS);
      expect(auth.issueSession).toHaveBeenCalledTimes(1);
    });
  });

  describe('chưa có tài khoản (dòng 5, 6)', () => {
    it('test 20: thiếu role -> 400 IDENTITY_ROLE_REQUIRED, không ghi gì', async () => {
      const { service, dataSource } = setup();
      expect(await codeOf(service.login('t'))).toBe(IdentityError.ROLE_REQUIRED);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('role không hợp lệ (ADMIN) -> 400 IDENTITY_ROLE_REQUIRED', async () => {
      const { service } = setup();
      expect(await codeOf(service.login('t', 'ADMIN' as never))).toBe(IdentityError.ROLE_REQUIRED);
    });

    it('test 20: có role -> tạo user ACTIVE (password_hash null, email_verified_at) + user_identities + outbox, một transaction', async () => {
      const { service, manager, outbox, dataSource, auth } = setup();
      await service.login('t', 'LANDLORD');

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      const userSave = manager.save.mock.calls.find(
        ([e]) => (e as { name: string }).name === 'User',
      )!;
      expect(userSave[1]).toMatchObject({
        email: 'an@example.com',
        fullName: 'Nguyễn Văn An',
        role: 'LANDLORD',
        status: 'ACTIVE',
        passwordHash: null,
      });
      expect((userSave[1] as { emailVerifiedAt: unknown }).emailVerifiedAt).toBeInstanceOf(Date);
      expect(manager.save).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ provider: 'google', providerUserId: SUB, userId: USER.id }),
      );
      expect(outbox.add).toHaveBeenCalledWith(manager, 'identity.registered', {
        userId: USER.id,
        email: 'an@example.com',
        fullName: 'Nguyễn Văn An',
        role: 'LANDLORD',
      });
      expect(auth.issueSession).toHaveBeenCalledWith(
        expect.objectContaining({ id: USER.id, role: 'LANDLORD' }),
      );
    });

    it('Google không có tên: họ tên lấy phần trước @ của email; tên quá dài bị cắt còn 200 ký tự', async () => {
      const noName = setup({ google: { name: undefined } });
      await noName.service.login('t', 'TENANT');
      const first = noName.manager.save.mock.calls.find(
        ([e]) => (e as { name: string }).name === 'User',
      )!;
      expect((first[1] as { fullName: string }).fullName).toBe('an');

      const long = setup({ google: { name: 'A'.repeat(300) } });
      await long.service.login('t', 'TENANT');
      const second = long.manager.save.mock.calls.find(
        ([e]) => (e as { name: string }).name === 'User',
      )!;
      expect((second[1] as { fullName: string }).fullName).toHaveLength(200);
    });

    it('đăng ký đồng thời cùng email (23505 khi tạo): thử lại một lần, rơi vào nhánh có tài khoản', async () => {
      const { service, dataSource, users, auth } = setup();
      dataSource.transaction.mockRejectedValueOnce(
        new QueryFailedError('INSERT', [], Object.assign(new Error('dup'), { code: '23505' })),
      );
      users.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(USER);

      await expect(service.login('t', 'TENANT')).resolves.toBe(TOKENS);
      expect(auth.issueSession).toHaveBeenCalledTimes(1);
    });

    it('lỗi DB khác khi tạo -> ném nguyên', async () => {
      const { service, dataSource } = setup();
      const boom = new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('x'), { code: '08006' }),
      );
      dataSource.transaction.mockRejectedValueOnce(boom);
      await expect(service.login('t', 'TENANT')).rejects.toBe(boom);
    });
  });
});
