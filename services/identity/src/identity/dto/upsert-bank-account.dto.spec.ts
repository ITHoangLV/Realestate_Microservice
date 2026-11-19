import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpsertBankAccountDto } from './upsert-bank-account.dto';

const valid = {
  bankName: 'Vietcombank',
  accountNumber: '0123456789',
  accountHolder: 'TRAN THI BINH',
};

async function parse(plain: Record<string, unknown>) {
  const dto = plainToInstance(UpsertBankAccountDto, plain);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, fields: errors.map((e) => e.property) };
}

describe('UpsertBankAccountDto', () => {
  it('hợp lệ', async () => {
    const { dto, fields } = await parse(valid);
    expect(fields).toEqual([]);
    expect(dto).toMatchObject(valid);
  });

  it('accountHolder: cắt khoảng trắng hai đầu trước khi kiểm độ dài', async () => {
    const { dto, fields } = await parse({ ...valid, accountHolder: '  TRAN THI BINH \t' });
    expect(fields).toEqual([]);
    expect(dto.accountHolder).toBe('TRAN THI BINH');
  });

  it.each([
    ['chuỗi toàn khoảng trắng', '   \t  '],
    ['chuỗi rỗng', ''],
    ['dài hơn 200 ký tự', 'A'.repeat(201)],
    ['không phải chuỗi', 12345],
  ])('accountHolder: từ chối %s', async (_name, accountHolder) => {
    expect((await parse({ ...valid, accountHolder })).fields).toContain('accountHolder');
  });

  it('accountHolder: đúng 200 ký tự (sau khi cắt) thì hợp lệ', async () => {
    expect((await parse({ ...valid, accountHolder: ` ${'A'.repeat(200)} ` })).fields).toEqual([]);
  });

  it.each([
    ['5 chữ số', '12345'],
    ['20 chữ số', '1'.repeat(20)],
    ['có chữ cái', '12345678a'],
    ['có khoảng trắng', '1234 5678'],
    ['có dấu gạch', '1234-5678'],
    ['xuống dòng ở cuối', '123456789\n'],
    ['là số, không phải chuỗi', 123456789],
  ])('accountNumber: từ chối %s', async (_name, accountNumber) => {
    expect((await parse({ ...valid, accountNumber })).fields).toContain('accountNumber');
  });

  it.each(['123456', '1'.repeat(19)])('accountNumber: chấp nhận %s', async (accountNumber) => {
    expect((await parse({ ...valid, accountNumber })).fields).toEqual([]);
  });

  it.each([
    ['1 ký tự', 'V'],
    ['101 ký tự', 'V'.repeat(101)],
    ['không phải chuỗi', 5],
  ])('bankName: từ chối %s', async (_name, bankName) => {
    expect((await parse({ ...valid, bankName })).fields).toContain('bankName');
  });

  it.each([['VP'], ['V'.repeat(100)]])('bankName: chấp nhận %s', async (bankName) => {
    expect((await parse({ ...valid, bankName })).fields).toEqual([]);
  });

  it('từ chối trường thừa (ví dụ userId): không tin userId trong body', async () => {
    expect((await parse({ ...valid, userId: 'x' })).fields).toContain('userId');
  });

  it('thiếu trường nào thì báo trường đó', async () => {
    const { fields } = await parse({});
    expect(fields.sort()).toEqual(['accountHolder', 'accountNumber', 'bankName']);
  });
});
