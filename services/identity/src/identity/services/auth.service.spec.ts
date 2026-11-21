import { QueryFailedError } from 'typeorm';
import { AuthService } from './auth.service';
import { IdentityError } from '../errors/identity.errors';
import type { RefreshTokenStore, RotateResult } from '../stores/refresh-token.store';
import type { User } from '../entities/user.entity';

/**
 * Store giả trong bộ nhớ, mô phỏng đúng quy tắc của Redis store:
 * token đã dùng thì dùng lại = reuse (thu hồi cả họ); họ bị thu hồi thì mọi token của họ = invalid.
 * (Script Lua thật được test ở test/refresh-token.store.infra-spec.ts.)
 */
class FakeStore implements RefreshTokenStore {
  tokens = new Map<string, { userId: string; familyId: string; used: boolean }>();
  revoked = new Set<string>();

  async create(token: string, userId: string, familyId: string): Promise<void> {
    this.tokens.set(token, { userId, familyId, used: false });
  }

  async rotate(oldToken: string, newToken: string): Promise<RotateResult> {
    const t = this.tokens.get(oldToken);
    if (!t) return { status: 'invalid' };
    if (t.used) {
      this.revoked.add(t.familyId);
      return { status: 'reuse', userId: t.userId, familyId: t.familyId };
    }
    if (this.revoked.has(t.familyId)) return { status: 'invalid' };
    t.used = true;
    this.tokens.set(newToken, { userId: t.userId, familyId: t.familyId, used: false });
    return { status: 'ok', userId: t.userId, familyId: t.familyId };
  }

  async revokeFamilyOf(token: string): Promise<boolean> {
    const t = this.tokens.get(token);
    if (!t) return false;
    this.revoked.add(t.familyId);
    return true;
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const families = new Set<string>();
    for (const t of this.tokens.values()) if (t.userId === userId) families.add(t.familyId);
    families.forEach((f) => this.revoked.add(f));
    return families.size;
  }
}

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'an@example.com',
  passwordHash: 'hash-that',
  fullName: 'Nguyễn Văn An',
  role: 'TENANT',
  status: 'ACTIVE',
  phone: null,
  createdAt: new Date('2026-11-06T10:00:00.000Z'),
} as User;

function setup(opts: { user?: User | null; verify?: boolean } = {}) {
  const store = new FakeStore();
  let counter = 0;
  const users = {
    findOne: jest.fn().mockResolvedValue(opts.user === undefined ? USER : opts.user),
    findOneBy: jest.fn().mockResolvedValue(opts.user === undefined ? USER : opts.user),
  };
  const manager = {
    save: jest.fn(async (_entity: unknown, data: Record<string, unknown>) => ({
      ...data,
      id: USER.id,
      createdAt: USER.createdAt,
    })),
  };
  const dataSource = { transaction: jest.fn(async (cb: (m: unknown) => unknown) => cb(manager)) };
  const passwords = {
    hash: jest.fn().mockResolvedValue('hash-moi'),
    verify: jest.fn().mockResolvedValue(opts.verify ?? true),
    verifyDummy: jest.fn().mockResolvedValue(undefined),
  };
  const tokens = {
    signAccessToken: jest.fn().mockResolvedValue({ accessToken: 'access-jwt', expiresIn: 900 }),
    generateRefreshToken: jest.fn(() => `refresh-${++counter}`),
  };
  const outbox = { add: jest.fn().mockResolvedValue({}) };
  const emailVerification = {
    ensureAvailable: jest.fn().mockResolvedValue(undefined),
    issue: jest.fn().mockResolvedValue(undefined),
    verify: jest.fn().mockResolvedValue({ ...USER, status: 'ACTIVE' }),
    resend: jest.fn().mockResolvedValue(undefined),
  };
  const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn() };
  const service = new AuthService(
    users as never,
    dataSource as never,
    passwords as never,
    tokens as never,
    store,
    outbox as never,
    emailVerification as never,
    logger as never,
  );
  return {
    service,
    store,
    users,
    manager,
    dataSource,
    passwords,
    tokens,
    outbox,
    emailVerification,
    logger,
  };
}

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'khong-loi',
    (e: { code?: string }) => e.code,
  );

describe('AuthService.register', () => {
  const dto = {
    email: 'an@example.com',
    password: 'Mat-khau-1234',
    fullName: 'Nguyễn Văn An',
    role: 'TENANT' as const,
  };

  it('lưu user với password đã hash và ghi event identity.registered CÙNG transaction', async () => {
    const { service, manager, outbox, dataSource } = setup();
    const result = await service.register(dto);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        email: 'an@example.com',
        passwordHash: 'hash-moi',
        role: 'TENANT',
        status: 'PENDING_VERIFICATION',
        phone: null,
      }),
    );
    // outbox.add nhận đúng manager của transaction
    expect(outbox.add).toHaveBeenCalledWith(manager, 'identity.registered', {
      userId: USER.id,
      email: 'an@example.com',
      fullName: 'Nguyễn Văn An',
      role: 'TENANT',
    });
    expect(result).toEqual({
      id: USER.id,
      email: 'an@example.com',
      fullName: 'Nguyễn Văn An',
      role: 'TENANT',
      status: 'PENDING_VERIFICATION',
      phone: null,
      createdAt: '2026-11-06T10:00:00.000Z',
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('lưu số điện thoại khi có', async () => {
    const { service, manager } = setup();
    const result = await service.register({ ...dto, phone: '0912345678' });
    expect(manager.save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ phone: '0912345678' }),
    );
    expect(result.phone).toBe('0912345678');
  });

  it('kiểm Redis sống TRƯỚC khi ghi DB: Redis dừng thì lỗi 503 và không có transaction', async () => {
    const { service, emailVerification, dataSource } = setup();
    const down = Object.assign(new Error('Redis dừng'), { code: 'DEPENDENCY_UNAVAILABLE' });
    emailVerification.ensureAvailable.mockRejectedValueOnce(down);
    await expect(service.register(dto)).rejects.toBe(down);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('sau commit sinh OTP và gửi mail cho đúng user, KHÔNG chờ (OTP treo vẫn trả kết quả)', async () => {
    const { service, emailVerification, dataSource } = setup();
    emailVerification.issue.mockReturnValueOnce(new Promise(() => undefined));
    await expect(service.register(dto)).resolves.toMatchObject({ id: USER.id });
    expect(emailVerification.issue).toHaveBeenCalledWith(USER.id, 'an@example.com');
    // issue chỉ được gọi sau khi transaction xong
    expect(dataSource.transaction.mock.invocationCallOrder[0]).toBeLessThan(
      emailVerification.issue.mock.invocationCallOrder[0],
    );
  });

  it('sinh OTP lỗi sau commit: vẫn trả kết quả, log warn không chứa email', async () => {
    const { service, emailVerification, logger } = setup();
    emailVerification.issue.mockRejectedValueOnce(new Error('redis down an@example.com'));
    await expect(service.register(dto)).resolves.toMatchObject({ id: USER.id });
    await new Promise((resolve) => setImmediate(resolve));
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logger.warn.mock.calls[0])).not.toContain('an@example.com');
  });

  it('DB báo trùng số điện thoại (UQ_users_phone) -> 409 IDENTITY_PHONE_TAKEN', async () => {
    const { service, dataSource } = setup();
    dataSource.transaction.mockRejectedValueOnce(
      new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('dup'), { code: '23505', constraint: 'UQ_users_phone' }),
      ),
    );
    expect(await codeOf(service.register({ ...dto, phone: '0912345678' }))).toBe(
      IdentityError.PHONE_TAKEN,
    );
  });

  it('DB báo trùng email (UQ_users_email_lower) -> 409 IDENTITY_EMAIL_TAKEN', async () => {
    const { service, dataSource } = setup();
    dataSource.transaction.mockRejectedValueOnce(
      new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('dup'), { code: '23505', constraint: 'UQ_users_email_lower' }),
      ),
    );
    expect(await codeOf(service.register(dto))).toBe(IdentityError.EMAIL_TAKEN);
  });

  it('DB báo trùng email (23505) -> 409 IDENTITY_EMAIL_TAKEN', async () => {
    const { service, dataSource } = setup();
    dataSource.transaction.mockRejectedValueOnce(
      new QueryFailedError('INSERT', [], Object.assign(new Error('dup'), { code: '23505' })),
    );
    expect(await codeOf(service.register(dto))).toBe(IdentityError.EMAIL_TAKEN);
  });

  it('lỗi DB khác thì ném nguyên, không bị đổi thành 409', async () => {
    const { service, dataSource } = setup();
    const boom = new QueryFailedError(
      'INSERT',
      [],
      Object.assign(new Error('x'), { code: '08006' }),
    );
    dataSource.transaction.mockRejectedValueOnce(boom);
    await expect(service.register(dto)).rejects.toBe(boom);
  });
});

describe('AuthService.login', () => {
  const dto = { email: 'an@example.com', password: 'Mat-khau-1234' };

  it('đúng mật khẩu -> cặp token, và lưu refresh token vào store', async () => {
    const { service, store, tokens } = setup();
    const result = await service.login(dto);
    expect(result).toEqual({
      accessToken: 'access-jwt',
      refreshToken: 'refresh-1',
      tokenType: 'Bearer',
      expiresIn: 900,
    });
    expect(tokens.signAccessToken).toHaveBeenCalledWith(USER);
    expect(store.tokens.get('refresh-1')).toMatchObject({ userId: USER.id, used: false });
  });

  it('email không tồn tại -> IDENTITY_INVALID_CREDENTIALS và vẫn chạy verifyDummy (chống dò bằng độ trễ)', async () => {
    const { service, passwords } = setup({ user: null });
    expect(await codeOf(service.login(dto))).toBe(IdentityError.INVALID_CREDENTIALS);
    expect(passwords.verifyDummy).toHaveBeenCalledWith(dto.password);
    expect(passwords.verify).not.toHaveBeenCalled();
  });

  it('sai mật khẩu -> CÙNG mã lỗi với email không tồn tại', async () => {
    const { service, store } = setup({ verify: false });
    expect(await codeOf(service.login(dto))).toBe(IdentityError.INVALID_CREDENTIALS);
    expect(store.tokens.size).toBe(0);
  });

  it('tài khoản chưa có mật khẩu (chỉ đăng nhập Google) -> cũng INVALID_CREDENTIALS', async () => {
    const { service, passwords } = setup({ user: { ...USER, passwordHash: null } as User });
    expect(await codeOf(service.login(dto))).toBe(IdentityError.INVALID_CREDENTIALS);
    expect(passwords.verifyDummy).toHaveBeenCalled();
  });
});

describe('AuthService.login: trạng thái tài khoản (test 14)', () => {
  const dto = { email: 'an@example.com', password: 'Mat-khau-1234' };

  it('đúng mật khẩu nhưng chưa xác minh -> 403 IDENTITY_EMAIL_NOT_VERIFIED, không cấp token', async () => {
    const { service, store } = setup({ user: { ...USER, status: 'PENDING_VERIFICATION' } as User });
    expect(await codeOf(service.login(dto))).toBe(IdentityError.EMAIL_NOT_VERIFIED);
    expect(store.tokens.size).toBe(0);
  });

  it('đúng mật khẩu nhưng bị khóa -> 403 IDENTITY_ACCOUNT_LOCKED, không cấp token', async () => {
    const { service, store } = setup({ user: { ...USER, status: 'LOCKED' } as User });
    expect(await codeOf(service.login(dto))).toBe(IdentityError.ACCOUNT_LOCKED);
    expect(store.tokens.size).toBe(0);
  });

  it('SAI mật khẩu thì vẫn 401 chung, dù chưa xác minh hay bị khóa (không lộ trạng thái)', async () => {
    for (const status of ['PENDING_VERIFICATION', 'LOCKED'] as const) {
      const { service } = setup({ user: { ...USER, status } as User, verify: false });
      expect(await codeOf(service.login(dto))).toBe(IdentityError.INVALID_CREDENTIALS);
    }
  });
});

describe('AuthService.verifyOtp / resendOtp', () => {
  it('verify-otp đúng -> cấp phiên (cặp token) cho user vừa được ACTIVE', async () => {
    const { service, emailVerification, store, tokens } = setup();
    const result = await service.verifyOtp({ email: 'an@example.com', otp: '123456' });

    expect(emailVerification.verify).toHaveBeenCalledWith('an@example.com', '123456');
    expect(result).toMatchObject({ accessToken: 'access-jwt', tokenType: 'Bearer' });
    expect(tokens.signAccessToken).toHaveBeenCalledWith(expect.objectContaining({ id: USER.id }));
    expect(store.tokens.size).toBe(1);
  });

  it('verify-otp sai -> lỗi của EmailVerificationService, KHÔNG cấp token', async () => {
    const { service, emailVerification, store } = setup();
    const err = Object.assign(new Error('x'), { code: IdentityError.OTP_INVALID });
    emailVerification.verify.mockRejectedValueOnce(err);
    await expect(service.verifyOtp({ email: 'an@example.com', otp: '000000' })).rejects.toBe(err);
    expect(store.tokens.size).toBe(0);
  });

  it('resend-otp chuyển cho EmailVerificationService', async () => {
    const { service, emailVerification } = setup();
    await service.resendOtp('an@example.com');
    expect(emailVerification.resend).toHaveBeenCalledWith('an@example.com');
  });
});

describe('AuthService.refresh (xoay vòng token)', () => {
  it('đổi token cũ lấy token mới; token mới đổi tiếp được', async () => {
    const { service, store } = setup();
    const first = await service.login({ email: USER.email, password: 'x' });
    const second = await service.refresh(first.refreshToken);

    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.accessToken).toBe('access-jwt');
    expect(store.tokens.get(first.refreshToken)?.used).toBe(true);
    // cùng một họ
    expect(store.tokens.get(second.refreshToken)?.familyId).toBe(
      store.tokens.get(first.refreshToken)?.familyId,
    );
    await expect(service.refresh(second.refreshToken)).resolves.toMatchObject({
      tokenType: 'Bearer',
    });
  });

  it('dùng lại token cũ -> lỗi, ghi log cảnh báo, và token MỚI NHẤT của họ cũng chết', async () => {
    const { service, logger } = setup();
    const first = await service.login({ email: USER.email, password: 'x' });
    const second = await service.refresh(first.refreshToken);

    expect(await codeOf(service.refresh(first.refreshToken))).toBe(
      IdentityError.INVALID_REFRESH_TOKEN,
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER.id }),
      expect.stringContaining('bị dùng lại'),
    );
    expect(await codeOf(service.refresh(second.refreshToken))).toBe(
      IdentityError.INVALID_REFRESH_TOKEN,
    );
  });

  it('token lạ -> INVALID_REFRESH_TOKEN, không ghi log cảnh báo', async () => {
    const { service, logger } = setup();
    expect(await codeOf(service.refresh('khong-co'))).toBe(IdentityError.INVALID_REFRESH_TOKEN);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('user đã bị xóa sau khi phát token -> lỗi và thu hồi họ token', async () => {
    const { service, users, store } = setup();
    const first = await service.login({ email: USER.email, password: 'x' });
    users.findOneBy.mockResolvedValueOnce(null);
    expect(await codeOf(service.refresh(first.refreshToken))).toBe(
      IdentityError.INVALID_REFRESH_TOKEN,
    );
    expect(store.revoked.size).toBe(1);
  });
});

describe('AuthService.logout', () => {
  it('thu hồi cả họ: sau đó refresh bằng token của họ đó bị từ chối', async () => {
    const { service } = setup();
    const { refreshToken } = await service.login({ email: USER.email, password: 'x' });
    await service.logout(refreshToken);
    expect(await codeOf(service.refresh(refreshToken))).toBe(IdentityError.INVALID_REFRESH_TOKEN);
  });

  it('token không tồn tại vẫn không lỗi (idempotent)', async () => {
    const { service } = setup();
    await expect(service.logout('khong-co')).resolves.toBeUndefined();
  });
});

describe('AuthService.me', () => {
  it('trả thông tin user, không có passwordHash', async () => {
    const { service } = setup();
    const me = await service.me(USER.id);
    expect(me).toMatchObject({ id: USER.id, email: USER.email, role: 'TENANT' });
    expect(me).not.toHaveProperty('passwordHash');
  });

  it('user không còn tồn tại -> 401 AUTH_TOKEN_INVALID', async () => {
    const { service } = setup({ user: null });
    expect(await codeOf(service.me(USER.id))).toBe('AUTH_TOKEN_INVALID');
  });
});
