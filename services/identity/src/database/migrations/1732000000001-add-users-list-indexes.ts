import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Index cho `GET /admin/users` (`non-functional-standards.md §1`: index cho cột lọc, sắp xếp).
 * Truy vấn: `[WHERE role = ?] ORDER BY created_at DESC, id DESC LIMIT/OFFSET`. Hai index khớp đúng
 * thứ tự sắp nên Postgres đọc theo index, không cần bước Sort.
 */
export class AddUsersListIndexes1732000000001 implements MigrationInterface {
  name = 'AddUsersListIndexes1732000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_users_created_at_id" ON "users" ("created_at" DESC, "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_users_role_created_at_id" ON "users" ("role", "created_at" DESC, "id" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_users_role_created_at_id"`);
    await queryRunner.query(`DROP INDEX "IDX_users_created_at_id"`);
  }
}
