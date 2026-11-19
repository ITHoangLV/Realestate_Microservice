import { randomBytes, randomUUID } from 'node:crypto';
import { AppException } from '../../common/errors/app.exception';
import { BankAccountCipher } from './bank-account.cipher';
import { BankAccountService } from './bank-account.service';

const USER = randomUUID();
const NUMBER = '0123456789012';
const UPDATED_AT = new Date('2026-11-19T03:00:00.000Z');

/** DataSource giả: ghi lại câu SQL và tham số, trả về dòng cho sẵn. */
class FakeDataSource {
  calls: Array<{ sql: string; params: unknown[] }> = [];
  rows: Array<Record<string, unknown>> = [];
  async query(sql: string, params: unknown[]) {
    this.calls.push({ sql, params });
    return this.rows;
  }
}

/** Repository giả cho đường đọc. */
class FakeRepo {
  row: Record<string, unknown> | null = null;
  findOneCalls: unknown[] = [];
  async findOne(options: unknown) {
    this.findOneCalls.push(options);
    return this.row;
  }
}

describe('BankAccountService', () => {
  const cipher = new BankAccountCipher(randomBytes(32));
  let ds: FakeDataSource;
  let repo: FakeRepo;
  let service: BankAccountService;

  beforeEach(() => {
    ds = new FakeDataSource();
    repo = new FakeRepo();
    service = new BankAccountService(repo as never, ds as never, cipher);
  });

  describe('upsertMine', () => {
    const dto = { bankName: 'Vietcombank', accountNumber: NUMBER, accountHolder: 'TRAN THI BINH' };
    const returned = {
      bankName: dto.bankName,
      accountHolder: dto.accountHolder,
      accountLast4: '9012',
      updatedAt: UPDATED_AT,
      // cột thừa mà service không được rò ra
      accountNumberEncrypted: Buffer.from('x'),
      userId: USER,
    };

    it('một câu INSERT … ON CONFLICT (user_id) DO UPDATE, set updated_at = now() rõ ràng, có RETURNING', async () => {
      ds.rows = [returned];
      await service.upsertMine(USER, dto);

      expect(ds.calls).toHaveLength(1);
      const sql = ds.calls[0].sql.replace(/\s+/g, ' ');
      expect(sql).toMatch(/INSERT INTO bank_accounts/i);
      expect(sql).toMatch(/ON CONFLICT \(user_id\) DO UPDATE SET/i);
      expect(sql).toMatch(/updated_at = now\(\)/i);
      expect(sql).toMatch(/RETURNING/i);
    });

    it('tham số: userId, bankName, accountHolder, bản MÃ HÓA của số (không phải số rõ), bốn số cuối', async () => {
      ds.rows = [returned];
      await service.upsertMine(USER, dto);

      const [userId, bankName, holder, encrypted, last4] = ds.calls[0].params as [
        string,
        string,
        string,
        Buffer,
        string,
      ];
      expect([userId, bankName, holder, last4]).toEqual([
        USER,
        'Vietcombank',
        'TRAN THI BINH',
        '9012',
      ]);
      expect(Buffer.isBuffer(encrypted)).toBe(true);
      expect(encrypted.toString('latin1')).not.toContain(NUMBER);
      expect(cipher.decrypt(encrypted, USER)).toBe(NUMBER); // AAD = userId
    });

    it('không có số rõ ở bất kỳ tham số hay câu SQL nào', async () => {
      ds.rows = [returned];
      await service.upsertMine(USER, dto);
      const dump = JSON.stringify(ds.calls);
      expect(dump).not.toContain(NUMBER);
    });

    it('response dựng từng trường: đúng 4 trường, updatedAt là ISO, không rò cột thừa', async () => {
      ds.rows = [returned];
      const view = await service.upsertMine(USER, dto);

      expect(Object.keys(view).sort()).toEqual([
        'accountHolder',
        'accountLast4',
        'bankName',
        'updatedAt',
      ]);
      expect(view).toEqual({
        bankName: 'Vietcombank',
        accountHolder: 'TRAN THI BINH',
        accountLast4: '9012',
        updatedAt: '2026-11-19T03:00:00.000Z',
      });
    });
  });

  describe('getMine', () => {
    it('chưa khai -> 404 IDENTITY_BANK_ACCOUNT_NOT_FOUND', async () => {
      repo.row = null;
      const err = await service.getMine(USER).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe('IDENTITY_BANK_ACCOUNT_NOT_FOUND');
      expect((err as AppException).getStatus()).toBe(404);
    });

    it('đã khai -> 4 trường; truy vấn theo userId, một lần, không đọc cột số tài khoản mã hóa', async () => {
      repo.row = {
        id: randomUUID(),
        userId: USER,
        bankName: 'ACB',
        accountHolder: 'NGUYEN VAN AN',
        accountLast4: '3456',
        accountNumberEncrypted: Buffer.from('bí mật'),
        updatedAt: UPDATED_AT,
      };
      const view = await service.getMine(USER);

      expect(view).toEqual({
        bankName: 'ACB',
        accountHolder: 'NGUYEN VAN AN',
        accountLast4: '3456',
        updatedAt: '2026-11-19T03:00:00.000Z',
      });
      expect(repo.findOneCalls).toHaveLength(1);
      const opts = repo.findOneCalls[0] as {
        where: { userId: string };
        select: Record<string, boolean>;
      };
      expect(opts.where).toEqual({ userId: USER });
      expect(opts.select.accountNumberEncrypted).toBeUndefined();
    });
  });

  describe('getForPayout', () => {
    it('chưa khai -> 404 IDENTITY_BANK_ACCOUNT_NOT_FOUND', async () => {
      repo.row = null;
      await expect(service.getForPayout(USER)).rejects.toMatchObject({
        code: 'IDENTITY_BANK_ACCOUNT_NOT_FOUND',
      });
    });

    it('đã khai -> số đầy đủ giải mã đúng', async () => {
      repo.row = {
        userId: USER,
        bankName: 'ACB',
        accountHolder: 'NGUYEN VAN AN',
        accountNumberEncrypted: cipher.encrypt(NUMBER, USER),
      };
      await expect(service.getForPayout(USER)).resolves.toEqual({
        userId: USER,
        bankName: 'ACB',
        accountHolder: 'NGUYEN VAN AN',
        accountNumber: NUMBER,
      });
    });

    it('dữ liệu hỏng hoặc của người khác -> lỗi thường (filter đổi thành 500), thông báo không chứa số', async () => {
      repo.row = {
        userId: USER,
        bankName: 'ACB',
        accountHolder: 'NGUYEN VAN AN',
        accountNumberEncrypted: cipher.encrypt(NUMBER, randomUUID()), // mã hóa cho userId khác
      };
      const err = await service.getForPayout(USER).catch((e: unknown) => e);
      expect(err).not.toBeInstanceOf(AppException);
      expect(typeof (err as Error).message).toBe('string'); // lỗi của crypto, filter đổi thành 500
      expect(String((err as Error).message)).not.toContain(NUMBER);
    });
  });
});
