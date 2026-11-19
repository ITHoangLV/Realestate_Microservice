import { randomBytes, randomUUID } from 'node:crypto';
import { BankAccountCipher, IV_BYTES, TAG_BYTES, parseEncryptionKey } from './bank-account.cipher';

describe('BankAccountCipher', () => {
  const key = randomBytes(32);
  const cipher = new BankAccountCipher(key);
  const userId = randomUUID();
  const number = '0123456789012';

  it('khứ hồi: decrypt(encrypt(x)) = x', () => {
    expect(cipher.decrypt(cipher.encrypt(number, userId), userId)).toBe(number);
  });

  it('định dạng iv(12) ‖ authTag(16) ‖ ciphertext, không chứa số rõ', () => {
    const buf = cipher.encrypt(number, userId);
    expect(IV_BYTES).toBe(12);
    expect(TAG_BYTES).toBe(16);
    expect(buf.length).toBe(IV_BYTES + TAG_BYTES + number.length);
    expect(buf.toString('latin1')).not.toContain(number);
    expect(buf.toString('hex')).not.toContain(Buffer.from(number).toString('hex'));
  });

  it('hai lần mã hóa cùng số cho kết quả khác nhau (IV ngẫu nhiên)', () => {
    const a = cipher.encrypt(number, userId);
    const b = cipher.encrypt(number, userId);
    expect(a.equals(b)).toBe(false);
    expect(a.subarray(0, IV_BYTES).equals(b.subarray(0, IV_BYTES))).toBe(false);
  });

  it('sai userId (AAD): dòng của người này chép sang người khác thì giải mã lỗi', () => {
    const buf = cipher.encrypt(number, userId);
    expect(() => cipher.decrypt(buf, randomUUID())).toThrow();
  });

  it('sai khóa thì giải mã lỗi', () => {
    const buf = cipher.encrypt(number, userId);
    expect(() => new BankAccountCipher(randomBytes(32)).decrypt(buf, userId)).toThrow();
  });

  it.each([
    ['iv', 0],
    ['authTag', IV_BYTES],
    ['ciphertext', IV_BYTES + TAG_BYTES],
  ])('sửa một byte của %s thì giải mã lỗi', (_name, offset) => {
    const buf = Buffer.from(cipher.encrypt(number, userId));
    buf[offset] ^= 0x01;
    expect(() => cipher.decrypt(buf, userId)).toThrow();
  });

  it('dữ liệu quá ngắn thì giải mã lỗi', () => {
    expect(() => cipher.decrypt(Buffer.alloc(IV_BYTES + TAG_BYTES - 1), userId)).toThrow();
  });

  it('lỗi giải mã không chứa số tài khoản', () => {
    const buf = Buffer.from(cipher.encrypt(number, userId));
    buf[buf.length - 1] ^= 0x01;
    try {
      cipher.decrypt(buf, userId);
      throw new Error('phải lỗi');
    } catch (e) {
      expect(String((e as Error).message)).not.toContain(number);
    }
  });

  it('khóa không đủ 32 byte thì không tạo được cipher', () => {
    expect(() => new BankAccountCipher(randomBytes(16))).toThrow();
  });
});

describe('parseEncryptionKey', () => {
  it('base64 của đúng 32 byte -> Buffer 32 byte', () => {
    const raw = randomBytes(32);
    expect(parseEncryptionKey(raw.toString('base64')).equals(raw)).toBe(true);
  });

  it.each([
    ['rỗng', ''],
    ['16 byte', randomBytes(16).toString('base64')],
    ['33 byte', randomBytes(33).toString('base64')],
    ['không phải base64', '!!!không-phải-base64!!!'],
  ])('từ chối khóa %s', (_name, value) => {
    expect(() => parseEncryptionKey(value)).toThrow(/32 byte/);
  });
});
