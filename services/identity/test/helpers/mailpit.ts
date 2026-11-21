import { readRootEnv, waitFor } from './infra';

/**
 * Đọc email từ Mailpit (compose profile dev; giao diện và API ở cổng `MAILPIT_UI_PORT`, mặc định 8025).
 * Identity gửi email KHÔNG chờ (API_Spec §1.1) nên test phải HỎI LẠI vài lần cho tới khi thư tới.
 */
export interface MailpitMessage {
  id: string;
  subject: string;
  from: string;
  to: string[];
  text: string;
  html: string;
}

const base = (): string => `http://localhost:${readRootEnv().MAILPIT_UI_PORT ?? '8025'}`;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base()}${path}`);
  if (!res.ok) throw new Error(`Mailpit ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

/** Mọi thư gửi tới `email` (mới nhất trước). */
export async function mailsTo(email: string): Promise<MailpitMessage[]> {
  const found = await getJson<{ messages: Array<{ ID: string }> }>(
    `/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=50`,
  );
  const messages: MailpitMessage[] = [];
  for (const { ID } of found.messages ?? []) {
    const m = await getJson<{
      ID: string;
      Subject: string;
      From: { Address: string };
      To: Array<{ Address: string }>;
      Text: string;
      HTML: string;
    }>(`/api/v1/message/${ID}`);
    messages.push({
      id: m.ID,
      subject: m.Subject,
      from: m.From?.Address,
      to: (m.To ?? []).map((a) => a.Address),
      text: m.Text,
      html: m.HTML,
    });
  }
  return messages;
}

/** Chờ (hỏi lại mỗi 100ms) tới khi có ít nhất `count` thư gửi tới `email`. */
export function waitForMails(
  email: string,
  count = 1,
  timeoutMs = 10000,
): Promise<MailpitMessage[]> {
  return waitFor(
    async () => {
      const mails = await mailsTo(email);
      return mails.length >= count ? mails : null;
    },
    `${count} email gửi tới ${email} trong Mailpit`,
    timeoutMs,
  );
}

/** Mã OTP 6 chữ số trong nội dung thư. */
export function otpOf(mail: MailpitMessage): string {
  const match = /\b(\d{6})\b/.exec(mail.text);
  if (!match) throw new Error(`Không thấy OTP trong thư: ${mail.text}`);
  return match[1];
}

/** Token đặt lại mật khẩu trong link của thư. */
export function resetTokenOf(mail: MailpitMessage): string {
  const match = /[?&]token=([A-Za-z0-9_-]+)/.exec(mail.text);
  if (!match) throw new Error(`Không thấy link đặt lại trong thư: ${mail.text}`);
  return match[1];
}

/** Khẳng định KHÔNG có thư nào gửi tới `email` (chờ `settleMs` cho việc gửi nền kịp xảy ra nếu có). */
export async function expectNoMail(email: string, settleMs = 600): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, settleMs));
  const mails = await mailsTo(email);
  if (mails.length > 0)
    throw new Error(`Không được có thư gửi tới ${email}, nhưng có ${mails.length}`);
}
