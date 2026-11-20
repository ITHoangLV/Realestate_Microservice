/**
 * Người dùng seed cho môi trường dev (T2.4): 3 chủ trọ và 5 người thuê, id cố định để Postman và k6 dùng.
 *
 * Bảng id này lặp ở `guides/RE_Docker_Local_Guide.md §5`. Ba id chủ trọ cũng nằm trong
 * `services/listing/src/listing/seed/seed-listings.data.ts` (cột `owner_id` của tin): listing không được
 * import code của identity (ranh giới service), nên sửa id ở đây thì sửa cả hai nơi.
 */
export interface SeedUser {
  id: string;
  email: string;
  fullName: string;
  role: 'LANDLORD' | 'TENANT';
}

export const SEED_USERS: readonly SeedUser[] = [
  {
    id: 'a0000000-0000-4000-8000-000000000001',
    email: 'landlord1@seed.realestate.local',
    fullName: 'Nguyễn Văn Hùng',
    role: 'LANDLORD',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000002',
    email: 'landlord2@seed.realestate.local',
    fullName: 'Trần Thị Lan',
    role: 'LANDLORD',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000003',
    email: 'landlord3@seed.realestate.local',
    fullName: 'Lê Quang Minh',
    role: 'LANDLORD',
  },
  {
    id: 'b0000000-0000-4000-8000-000000000001',
    email: 'tenant1@seed.realestate.local',
    fullName: 'Phạm Thu Hà',
    role: 'TENANT',
  },
  {
    id: 'b0000000-0000-4000-8000-000000000002',
    email: 'tenant2@seed.realestate.local',
    fullName: 'Đỗ Minh Tuấn',
    role: 'TENANT',
  },
  {
    id: 'b0000000-0000-4000-8000-000000000003',
    email: 'tenant3@seed.realestate.local',
    fullName: 'Vũ Ngọc Anh',
    role: 'TENANT',
  },
  {
    id: 'b0000000-0000-4000-8000-000000000004',
    email: 'tenant4@seed.realestate.local',
    fullName: 'Hoàng Gia Bảo',
    role: 'TENANT',
  },
  {
    id: 'b0000000-0000-4000-8000-000000000005',
    email: 'tenant5@seed.realestate.local',
    fullName: 'Bùi Thanh Mai',
    role: 'TENANT',
  },
];
