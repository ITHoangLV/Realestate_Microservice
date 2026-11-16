import { MigrationInterface, QueryRunner } from 'typeorm';

/** Bảng của identity-service: users và user_identities (đăng nhập bên thứ ba, ví dụ Google). */
export class CreateIdentityTables1731000000000 implements MigrationInterface {
  name = 'CreateIdentityTables1731000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" text NOT NULL,
        "password_hash" text,
        "full_name" character varying(200) NOT NULL,
        "role" text NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_users_role" CHECK ("role" IN ('TENANT', 'LANDLORD', 'ADMIN'))
      )
    `);
    // Email duy nhất KHÔNG phân biệt hoa thường: "A@x.com" và "a@x.com" là cùng một người.
    // Hai request đăng ký cùng lúc cũng không lọt nhờ ràng buộc này (lỗi 23505).
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_users_email_lower" ON "users" (lower("email"))`,
    );

    await queryRunner.query(`
      CREATE TABLE "user_identities" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "provider" text NOT NULL,
        "provider_user_id" text NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_identities" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_identities_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_user_identities_provider" CHECK ("provider" IN ('google'))
      )
    `);
    // Một tài khoản Google chỉ gắn được với MỘT user...
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_user_identities_provider_sub" ON "user_identities" ("provider", "provider_user_id")`,
    );
    // ...và một user chỉ có MỘT liên kết cho mỗi nhà cung cấp.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_user_identities_user_provider" ON "user_identities" ("user_id", "provider")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "user_identities"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
