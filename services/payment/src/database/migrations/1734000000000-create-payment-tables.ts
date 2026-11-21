import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bảng của payment-service, đúng DDL ở `RE.PAYMENT/API_Spec.md §6` (payment order, webhook payOS, tiền đến muộn)
 * và `RE.PAYOUT/API_Spec.md §7` (ví trung gian, giao dịch ví, yêu cầu hoàn, lệnh rút, chứng từ, nhật ký).
 * Tạo hết ở T3.1 để các task sau (T3.4 webhook, T3.6 payout) không phải sửa lại cấu trúc.
 *
 * Tiền là `bigint` VND. `deposit_id`, `tenant_id`, `owner_id` tham chiếu service khác: không khóa ngoại (ADR-0005).
 * `admin_wallet` chỉ có MỘT dòng (`id = 1`, CHECK); migration tạo sẵn dòng đó với số dư 0.
 */
export class CreatePaymentTables1734000000000 implements MigrationInterface {
  name = 'CreatePaymentTables1734000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // orderCode của payOS là số nguyên, cấp từ sequence (RE.PAYMENT §6)
    await queryRunner.query(`CREATE SEQUENCE "payos_order_code_seq" START 100000`);
    await queryRunner.query(`
      CREATE TABLE "payment_orders" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "deposit_id" uuid NOT NULL CONSTRAINT "uq_payment_orders_deposit" UNIQUE,
        "tenant_id" uuid NOT NULL,
        "owner_id" uuid NOT NULL,
        "listing_title" varchar(200),
        "amount_vnd" bigint NOT NULL CHECK ("amount_vnd" > 0),
        "payos_order_code" bigint NOT NULL CONSTRAINT "uq_payment_orders_order_code" UNIQUE,
        "payos_payment_link_id" varchar(100),
        "checkout_url" text,
        "qr_code" text,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING'
          CONSTRAINT "ck_payment_orders_status" CHECK ("status" IN ('PENDING','PAID','CANCELLED')),
        "payos_reference" varchar(100) CONSTRAINT "uq_payment_orders_reference" UNIQUE,
        "expires_at" timestamptz NOT NULL,
        "paid_at" timestamptz,
        "cancelled_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "payos_webhook_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_code" bigint,
        "reference" varchar(100),
        "amount_vnd" bigint,
        "signature_valid" boolean NOT NULL,
        "result" varchar(30) NOT NULL,
        "raw" jsonb NOT NULL,
        "received_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    // Mỗi mã giao dịch payOS chỉ được ghi nhận một lần (BR-08, NFR01)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ux_webhook_accepted_reference" ON "payos_webhook_events" ("reference") WHERE "result" IN ('PAID','LATE')`,
    );
    await queryRunner.query(`
      CREATE TABLE "late_payments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_id" uuid NOT NULL REFERENCES "payment_orders"("id"),
        "deposit_id" uuid NOT NULL,
        "amount_vnd" bigint NOT NULL,
        "payos_reference" varchar(100) NOT NULL UNIQUE,
        "refund_request_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // --- RE.PAYOUT §7 ---
    await queryRunner.query(`
      CREATE TABLE "admin_wallet" (
        "id" smallint PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
        "balance_vnd" bigint NOT NULL DEFAULT 0 CHECK ("balance_vnd" >= 0),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`INSERT INTO "admin_wallet" ("id", "balance_vnd") VALUES (1, 0)`);
    await queryRunner.query(`
      CREATE TABLE "wallet_transactions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "type" varchar(20) NOT NULL
          CHECK ("type" IN ('DEPOSIT_IN','LATE_PAYMENT_IN','WITHDRAW_OUT','REFUND_OUT')),
        "amount_vnd" bigint NOT NULL CHECK ("amount_vnd" > 0),
        "deposit_id" uuid,
        "ref_type" varchar(20) NOT NULL,
        "ref_id" uuid NOT NULL,
        "tenant_id" uuid,
        "owner_id" uuid,
        "correlation_id" varchar(128),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_wallet_tx_ref" UNIQUE ("ref_type", "ref_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_wallet_tx_tenant" ON "wallet_transactions" ("tenant_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_wallet_tx_owner" ON "wallet_transactions" ("owner_id", "created_at" DESC)`,
    );
    await queryRunner.query(`
      CREATE TABLE "refund_requests" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "deposit_id" uuid NOT NULL,
        "tenant_id" uuid NOT NULL,
        "requester_type" varchar(10) NOT NULL CHECK ("requester_type" IN ('TENANT','SYSTEM')),
        "amount_vnd" bigint NOT NULL CHECK ("amount_vnd" > 0),
        "status" varchar(20) NOT NULL DEFAULT 'PENDING_ADMIN'
          CHECK ("status" IN ('PENDING_ADMIN','COMPLETED','REJECTED','FAILED')),
        "reason" varchar(500),
        "receipt_id" uuid,
        "processed_by" uuid,
        "processed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    // Một yêu cầu hoàn của người thuê đang mở hoặc đã xong mỗi đơn
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ux_refund_tenant_active" ON "refund_requests" ("deposit_id") WHERE "requester_type" = 'TENANT' AND "status" IN ('PENDING_ADMIN','FAILED','COMPLETED')`,
    );
    await queryRunner.query(`
      CREATE TABLE "withdrawal_requests" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "deposit_id" uuid NOT NULL,
        "owner_id" uuid NOT NULL,
        "amount_vnd" bigint NOT NULL CHECK ("amount_vnd" > 0),
        "bank_snapshot" jsonb NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING'
          CHECK ("status" IN ('PENDING','COMPLETED','FAILED')),
        "reason" varchar(500),
        "receipt_id" uuid,
        "processed_by" uuid,
        "processed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    // Mỗi đơn chỉ rút một lần (BR-16)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ux_withdrawal_active" ON "withdrawal_requests" ("deposit_id") WHERE "status" IN ('PENDING','COMPLETED')`,
    );
    await queryRunner.query(`
      CREATE TABLE "transfer_receipts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "sha256" char(64) NOT NULL UNIQUE,
        "object_key" varchar(300) NOT NULL,
        "uploaded_by" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "audit_log" (
        "id" bigserial PRIMARY KEY,
        "actor_id" uuid NOT NULL,
        "action" varchar(50) NOT NULL,
        "target_type" varchar(30) NOT NULL,
        "target_id" uuid NOT NULL,
        "before" jsonb,
        "after" jsonb,
        "correlation_id" varchar(128),
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'audit_log',
      'transfer_receipts',
      'withdrawal_requests',
      'refund_requests',
      'wallet_transactions',
      'admin_wallet',
      'late_payments',
      'payos_webhook_events',
      'payment_orders',
    ]) {
      await queryRunner.query(`DROP TABLE "${table}"`);
    }
    await queryRunner.query(`DROP SEQUENCE "payos_order_code_seq"`);
  }
}
