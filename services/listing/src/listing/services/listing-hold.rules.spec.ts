import { TARGET_STATUSES } from '../entities/listing.enums';
import {
  decideWhenNoMatch,
  isTransitionAllowed,
  sourcesFor,
  STATUS_TRANSITIONS,
} from './listing-hold.rules';

const DEP_A = '3f9a1c2e-8b4d-4e6f-a1b2-c3d4e5f60718';
const DEP_B = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a';

describe('listing-hold.rules (RE.LISTING/API_Spec.md §2.2)', () => {
  it('bảng chuyển hợp lệ đúng bốn cặp của thiết kế', () => {
    expect([...STATUS_TRANSITIONS].map((t) => `${t.from}>${t.to}`).sort()).toEqual([
      'DEPOSITED>AVAILABLE',
      'DEPOSITED>RENTED',
      'HELD>AVAILABLE',
      'HELD>DEPOSITED',
    ]);
  });

  it('đích hợp lệ của API: AVAILABLE, DEPOSITED, RENTED (không HELD, HIDDEN)', () => {
    expect([...TARGET_STATUSES]).toEqual(['AVAILABLE', 'DEPOSITED', 'RENTED']);
  });

  describe('sourcesFor', () => {
    it.each([
      ['AVAILABLE', ['HELD', 'DEPOSITED']],
      ['DEPOSITED', ['HELD']],
      ['RENTED', ['DEPOSITED']],
    ] as const)('đích %s có nguồn %j', (target, sources) => {
      expect([...sourcesFor(target)].sort()).toEqual([...sources].sort());
    });
  });

  describe('isTransitionAllowed', () => {
    it.each([
      ['HELD', 'AVAILABLE', true],
      ['HELD', 'DEPOSITED', true],
      ['DEPOSITED', 'RENTED', true],
      ['DEPOSITED', 'AVAILABLE', true],
      ['HELD', 'RENTED', false],
      ['AVAILABLE', 'DEPOSITED', false],
      ['AVAILABLE', 'RENTED', false],
      ['RENTED', 'AVAILABLE', false],
      ['RENTED', 'DEPOSITED', false],
      ['HIDDEN', 'AVAILABLE', false],
      ['DEPOSITED', 'DEPOSITED', false],
    ] as const)('%s → %s: %s', (from, to, expected) => {
      expect(isTransitionAllowed(from, to)).toBe(expected);
    });
  });

  describe('decideWhenNoMatch: UPDATE không khớp dòng nào, tin có tồn tại', () => {
    it('đích AVAILABLE, tin đã AVAILABLE: IDEMPOTENT với mọi depositId (held_by đã xóa)', () => {
      expect(
        decideWhenNoMatch({ status: 'AVAILABLE', heldByDepositId: null }, 'AVAILABLE', DEP_A),
      ).toBe('IDEMPOTENT');
      expect(
        decideWhenNoMatch({ status: 'AVAILABLE', heldByDepositId: null }, 'AVAILABLE', DEP_B),
      ).toBe('IDEMPOTENT');
    });

    it.each(['DEPOSITED', 'RENTED'] as const)(
      'đích %s, tin đã ở đích và thuộc CÙNG đơn: IDEMPOTENT',
      (target) => {
        expect(decideWhenNoMatch({ status: target, heldByDepositId: DEP_A }, target, DEP_A)).toBe(
          'IDEMPOTENT',
        );
      },
    );

    it.each(['DEPOSITED', 'RENTED'] as const)(
      'đích %s, tin ở đích nhưng thuộc đơn KHÁC: CONFLICT (test 11)',
      (target) => {
        expect(decideWhenNoMatch({ status: target, heldByDepositId: DEP_B }, target, DEP_A)).toBe(
          'CONFLICT',
        );
      },
    );

    it('đích AVAILABLE, tin HELD hoặc DEPOSITED thuộc đơn khác: CONFLICT (test 11)', () => {
      expect(
        decideWhenNoMatch({ status: 'HELD', heldByDepositId: DEP_B }, 'AVAILABLE', DEP_A),
      ).toBe('CONFLICT');
      expect(
        decideWhenNoMatch({ status: 'DEPOSITED', heldByDepositId: DEP_B }, 'AVAILABLE', DEP_A),
      ).toBe('CONFLICT');
    });

    it.each([
      ['AVAILABLE', 'DEPOSITED'],
      ['AVAILABLE', 'RENTED'],
      ['HIDDEN', 'AVAILABLE'],
      ['HIDDEN', 'DEPOSITED'],
      ['RENTED', 'AVAILABLE'],
      ['RENTED', 'DEPOSITED'],
      ['HELD', 'RENTED'],
    ] as const)('cặp không có trong bảng (tin %s → đích %s): CONFLICT', (status, target) => {
      const heldBy = status === 'RENTED' ? DEP_B : null;
      expect(decideWhenNoMatch({ status, heldByDepositId: heldBy }, target, DEP_A)).toBe(
        'CONFLICT',
      );
    });

    it('tin HIDDEN đích AVAILABLE: CONFLICT (ẩn không phải do đơn nào giữ)', () => {
      expect(
        decideWhenNoMatch({ status: 'HIDDEN', heldByDepositId: null }, 'AVAILABLE', DEP_A),
      ).toBe('CONFLICT');
    });
  });
});
