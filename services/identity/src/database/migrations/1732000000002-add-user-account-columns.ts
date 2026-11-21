import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T2.5 (B9, B10, C2): số điện thoại, trạng thái tài khoản, xác minh email, khóa tài khoản.
 * Theo `RE.IDENTITY/API_Spec.md §6` (v2.3).
 *
 * Tài khoản có trước migration giữ `ACTIVE` (mặc định) và được điền `email_verified_at = created_at`,
 * vì họ đã dùng được hệ thống: nếu để NULL thì khóa rồi mở khóa sẽ đưa họ về PENDING_VERIFICATION.
 */
export class AddUserAccountColumns1732000000002 implements MigrationInterface {
  name = 'AddUserAccountColumns1732000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN "phone" varchar(20),
        ADD COLUMN "status" text NOT NULL DEFAULT 'ACTIVE'
          CONSTRAINT "CK_users_status" CHECK ("status" IN ('PENDING_VERIFICATION','ACTIVE','LOCKED')),
        ADD COLUMN "email_verified_at" timestamptz,
        ADD COLUMN "locked_at" timestamptz,
        ADD COLUMN "locked_by" uuid,
        ADD COLUMN "lock_reason" varchar(500)
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_users_phone" ON "users" ("phone") WHERE "phone" IS NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "users" SET "email_verified_at" = "created_at" WHERE "status" = 'ACTIVE'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_users_phone"`);
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN "lock_reason",
        DROP COLUMN "locked_by",
        DROP COLUMN "locked_at",
        DROP COLUMN "email_verified_at",
        DROP COLUMN "status",
        DROP COLUMN "phone"
    `);
  }
}
