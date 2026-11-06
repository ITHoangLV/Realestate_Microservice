import { setTimeout as sleep } from 'node:timers/promises';

/** Schema Postgres riêng cho test hạ tầng (đặt qua search_path trong setup-infra-env.ts). */
export const INFRA_TEST_SCHEMA = 'template_infra_test';

/** Chờ đến khi `check()` trả giá trị truthy (thử lại mỗi 100ms), quá hạn thì ném lỗi. */
export async function waitFor<T>(
  check: () => Promise<T> | T,
  what: string,
  timeoutMs = 10000,
): Promise<NonNullable<T>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value as NonNullable<T>;
    if (Date.now() > deadline) throw new Error(`Hết ${timeoutMs}ms vẫn chưa thấy: ${what}`);
    await sleep(100);
  }
}
