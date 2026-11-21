import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GoogleLoginDto } from './google-login.dto';
import { EmailOnlyDto } from './email-only.dto';
import { LockUserDto } from './lock-user.dto';
import { RegisterDto } from './register.dto';
import { ResetPasswordDto } from './reset-password.dto';
import { UpdateProfileDto } from './update-profile.dto';
import { VerifyOtpDto } from './verify-otp.dto';

type Ctor<T> = new () => T;

async function parse<T extends object>(cls: Ctor<T>, plain: Record<string, unknown>) {
  const dto = plainToInstance(cls, plain);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, fields: errors.map((e) => e.property).sort() };
}

const register = {
  email: 'an@example.com',
  password: 'Mat-khau-1234',
  fullName: 'An',
  role: 'TENANT',
};

describe('RegisterDto.phone (B9)', () => {
  it('không bắt buộc', async () => {
    expect((await parse(RegisterDto, register)).fields).toEqual([]);
  });

  it.each(['0912345678', '0123456789'])('hợp lệ: %s', async (phone) => {
    expect((await parse(RegisterDto, { ...register, phone })).fields).toEqual([]);
  });

  it.each([
    ['không bắt đầu bằng 0', '1912345678'],
    ['thiếu số', '091234567'],
    ['thừa số', '09123456789'],
    ['có chữ', '09123abc78'],
    ['dạng +84', '+84912345678'],
    ['chuỗi rỗng', ''],
    ['không phải chuỗi', 912345678],
  ])('sai: %s', async (_name, phone) => {
    expect((await parse(RegisterDto, { ...register, phone })).fields).toEqual(['phone']);
  });

  it('cắt khoảng trắng hai đầu trước khi kiểm', async () => {
    const { dto, fields } = await parse(RegisterDto, { ...register, phone: ' 0912345678 ' });
    expect(fields).toEqual([]);
    expect(dto.phone).toBe('0912345678');
  });
});

describe('VerifyOtpDto', () => {
  it('email chuẩn hóa chữ thường, OTP đúng 6 chữ số', async () => {
    const { dto, fields } = await parse(VerifyOtpDto, { email: ' An@Example.COM ', otp: '012345' });
    expect(fields).toEqual([]);
    expect(dto).toMatchObject({ email: 'an@example.com', otp: '012345' });
  });

  it.each(['12345', '1234567', 'abcdef', '12 456', '', 123456])('OTP %p sai', async (otp) => {
    expect((await parse(VerifyOtpDto, { email: 'an@example.com', otp })).fields).toEqual(['otp']);
  });

  it('email sai', async () => {
    expect(
      (await parse(VerifyOtpDto, { email: 'khong-phai-email', otp: '123456' })).fields,
    ).toEqual(['email']);
  });
});

describe('EmailOnlyDto (resend-otp, forgot-password)', () => {
  it('chuẩn hóa email', async () => {
    const { dto, fields } = await parse(EmailOnlyDto, { email: ' An@Example.com' });
    expect(fields).toEqual([]);
    expect(dto.email).toBe('an@example.com');
  });

  it('thiếu hoặc sai email -> lỗi; trường lạ bị từ chối', async () => {
    expect((await parse(EmailOnlyDto, {})).fields).toEqual(['email']);
    expect((await parse(EmailOnlyDto, { email: 'x' })).fields).toEqual(['email']);
    expect((await parse(EmailOnlyDto, { email: 'an@example.com', role: 'ADMIN' })).fields).toEqual([
      'role',
    ]);
  });
});

describe('ResetPasswordDto', () => {
  const ok = { token: 'abc_DEF-123', newPassword: 'Mat-khau-moi-1' };

  it('hợp lệ', async () => {
    expect((await parse(ResetPasswordDto, ok)).fields).toEqual([]);
  });

  it('mật khẩu mới theo luật của đăng ký: tối thiểu 8, tối đa 128 ký tự', async () => {
    expect((await parse(ResetPasswordDto, { ...ok, newPassword: '1234567' })).fields).toEqual([
      'newPassword',
    ]);
    expect((await parse(ResetPasswordDto, { ...ok, newPassword: 'a'.repeat(129) })).fields).toEqual(
      ['newPassword'],
    );
    expect((await parse(ResetPasswordDto, { ...ok, newPassword: 'a'.repeat(128) })).fields).toEqual(
      [],
    );
  });

  it('token bắt buộc, không rỗng, có trần độ dài', async () => {
    expect((await parse(ResetPasswordDto, { newPassword: ok.newPassword })).fields).toEqual([
      'token',
    ]);
    expect((await parse(ResetPasswordDto, { ...ok, token: '' })).fields).toEqual(['token']);
    expect((await parse(ResetPasswordDto, { ...ok, token: 'a'.repeat(257) })).fields).toEqual([
      'token',
    ]);
  });
});

describe('GoogleLoginDto', () => {
  it('chỉ idToken: hợp lệ', async () => {
    expect((await parse(GoogleLoginDto, { idToken: 'eyJ.x.y' })).fields).toEqual([]);
  });

  it.each(['TENANT', 'LANDLORD'])('role %s hợp lệ', async (role) => {
    expect((await parse(GoogleLoginDto, { idToken: 'eyJ.x.y', role })).fields).toEqual([]);
  });

  it('role ADMIN hoặc lạ -> lỗi (BR-01)', async () => {
    expect((await parse(GoogleLoginDto, { idToken: 'eyJ.x.y', role: 'ADMIN' })).fields).toEqual([
      'role',
    ]);
  });

  it('thiếu idToken -> lỗi', async () => {
    expect((await parse(GoogleLoginDto, {})).fields).toEqual(['idToken']);
  });
});

describe('UpdateProfileDto (route 15)', () => {
  it('fullName cắt khoảng trắng, 1–200 ký tự', async () => {
    const { dto, fields } = await parse(UpdateProfileDto, { fullName: '  Trần Thị Bình ' });
    expect(fields).toEqual([]);
    expect(dto.fullName).toBe('Trần Thị Bình');
    expect((await parse(UpdateProfileDto, { fullName: '   ' })).fields).toEqual(['fullName']);
    expect((await parse(UpdateProfileDto, { fullName: 'a'.repeat(201) })).fields).toEqual([
      'fullName',
    ]);
  });

  it('phone hợp lệ, null (xóa số), hoặc vắng mặt', async () => {
    expect((await parse(UpdateProfileDto, { phone: '0912345678' })).fields).toEqual([]);
    expect((await parse(UpdateProfileDto, { phone: null })).fields).toEqual([]);
    expect((await parse(UpdateProfileDto, { fullName: 'An' })).fields).toEqual([]);
  });

  it('phone sai định dạng -> lỗi', async () => {
    expect((await parse(UpdateProfileDto, { phone: '12345' })).fields).toEqual(['phone']);
  });

  it('test 23a: fullName null -> lỗi (chỉ phone nhận null; cột full_name NOT NULL)', async () => {
    expect((await parse(UpdateProfileDto, { fullName: null })).fields).toEqual(['fullName']);
    expect((await parse(UpdateProfileDto, { fullName: null, phone: null })).fields).toEqual([
      'fullName',
    ]);
  });

  it('không cho đổi trường khác (email, role, status)', async () => {
    const { fields } = await parse(UpdateProfileDto, {
      fullName: 'An',
      email: 'x@y.com',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    expect(fields).toEqual(['email', 'role', 'status']);
  });
});

describe('LockUserDto', () => {
  it('reason bắt buộc, cắt khoảng trắng, 1–500 ký tự', async () => {
    const { dto, fields } = await parse(LockUserDto, { reason: ' Lừa đảo ' });
    expect(fields).toEqual([]);
    expect(dto.reason).toBe('Lừa đảo');
    expect((await parse(LockUserDto, {})).fields).toEqual(['reason']);
    expect((await parse(LockUserDto, { reason: '  ' })).fields).toEqual(['reason']);
    expect((await parse(LockUserDto, { reason: 'a'.repeat(501) })).fields).toEqual(['reason']);
    expect((await parse(LockUserDto, { reason: 'a'.repeat(500) })).fields).toEqual([]);
  });
});
