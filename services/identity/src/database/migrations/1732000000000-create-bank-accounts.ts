import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bảng tài khoản nhận tiền (`RE.IDENTITY/API_Spec.md §6`). Mỗi người một dòng (UQ theo user_id).
 * `account_number_encrypted` = iv(12) ‖ authTag(16) ‖ ciphertext, AES-256-GCM, AAD = user_id.
 * Số đầy đủ không bao giờ nằm trong DB dạng rõ; chỉ `account_last4` để hiển thị.
 */
export class CreateBankAccounts1732000000000 implements MigrationInterface {
  name = 'CreateBankAccounts1732000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "bank_accounts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "bank_name" character varying(100) NOT NULL,
        "account_holder" character varying(200) NOT NULL,
        "account_number_encrypted" bytea NOT NULL,
        "account_last4" character(4) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bank_accounts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_bank_accounts_user" UNIQUE ("user_id"),
        CONSTRAINT "FK_bank_accounts_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "bank_accounts"`);
  }
}
