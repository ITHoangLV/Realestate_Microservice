import { MailService } from './mail.service';
import type { MailTransport } from './mail.service';

const OPTIONS = { from: 'no-reply@realestate.local', otpTtlSeconds: 300, resetTtlSeconds: 900 };

function setup(sendMail: MailTransport['sendMail'] = jest.fn().mockResolvedValue({})) {
  const transport: MailTransport = { sendMail } as MailTransport;
  const logger = { setContext: jest.fn(), warn: jest.fn() };
  const service = new MailService(transport, OPTIONS, logger as never);
  return { service, sendMail: sendMail as jest.Mock, logger };
}

/** Cho các việc nền (đã lên lịch bằng promise) chạy xong. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('MailService.sendOtp', () => {
  it('gửi tới đúng người nhận, từ MAIL_FROM, nội dung có mã OTP và thời hạn 5 phút', async () => {
    const { service, sendMail } = setup();
    service.sendOtp('an@example.com', '123456');
    await flush();

    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe('an@example.com');
    expect(mail.from).toBe('no-reply@realestate.local');
    expect(mail.subject).toContain('xác minh');
    expect(mail.text).toContain('123456');
    expect(mail.text).toContain('5 phút');
    expect(mail.html).toContain('123456');
  });

  it('KHÔNG chờ SMTP: trả về ngay cả khi transport chưa xong', () => {
    const pending = jest.fn(() => new Promise<never>(() => undefined));
    const { service } = setup(pending as never);
    expect(service.sendOtp('an@example.com', '123456')).toBeUndefined();
    expect(pending).toHaveBeenCalledTimes(1);
  });

  it('SMTP lỗi: không ném, log warn KHÔNG chứa OTP, địa chỉ nhận hay nội dung lỗi gốc', async () => {
    const err = Object.assign(new Error('550 rejected an@example.com code 123456'), {
      code: 'EENVELOPE',
    });
    const { service, logger } = setup(jest.fn().mockRejectedValue(err));
    expect(() => service.sendOtp('an@example.com', '123456')).not.toThrow();
    await flush();

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(logger.warn.mock.calls[0]);
    expect(logged).not.toContain('123456');
    expect(logged).not.toContain('an@example.com');
    expect(logged).toContain('EENVELOPE');
  });

  it('transport ném đồng bộ cũng không làm hỏng người gọi', async () => {
    const { service, logger } = setup(
      jest.fn(() => {
        throw new Error('boom');
      }) as never,
    );
    expect(() => service.sendOtp('an@example.com', '123456')).not.toThrow();
    await flush();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});

describe('MailService.sendPasswordReset', () => {
  const link = 'http://localhost:3000/reset-password?token=abc_DEF-123';

  it('gửi link đặt lại, nêu hạn 15 phút', async () => {
    const { service, sendMail } = setup();
    service.sendPasswordReset('an@example.com', link);
    await flush();

    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe('an@example.com');
    expect(mail.subject).toContain('đặt lại mật khẩu');
    expect(mail.text).toContain(link);
    expect(mail.text).toContain('15 phút');
    expect(mail.html).toContain(link);
  });

  it('lỗi SMTP: log warn không chứa link (có token) hay địa chỉ nhận', async () => {
    const { service, logger } = setup(jest.fn().mockRejectedValue(new Error(link)));
    service.sendPasswordReset('an@example.com', link);
    await flush();

    const logged = JSON.stringify(logger.warn.mock.calls[0]);
    expect(logged).not.toContain('abc_DEF-123');
    expect(logged).not.toContain('an@example.com');
  });
});
