#!/bin/bash
# =============================================================================
# Tạo user MongoDB riêng cho từng service trên cùng một instance (mỗi service một DB):
#   notification_db / notification_user, maintenance_db / maintenance_user.
# - CHỈ chạy lần đầu khi volume còn trống (docker-entrypoint-initdb.d).
#   Chạy lại: pnpm infra:down ; docker volume rm realestate_mongo_data
# - Mật khẩu lấy từ biến môi trường, không hard-code. User chỉ có quyền readWrite trên DB của mình.
# File này PHẢI dùng LF (xem .gitattributes).
# =============================================================================
set -Eeuo pipefail

for v in NOTIFICATION MAINTENANCE; do
  for suffix in MONGO_DB MONGO_USER MONGO_PASSWORD; do
    name="${v}_${suffix}"
    if [ -z "${!name:-}" ]; then
      echo "LỖI: thiếu biến môi trường ${name}" >&2
      exit 1
    fi
  done
done

mongosh --quiet \
  --username "$MONGO_INITDB_ROOT_USERNAME" \
  --password "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin <<'EOJS'
const services = [
  { db: process.env.NOTIFICATION_MONGO_DB, user: process.env.NOTIFICATION_MONGO_USER, pwd: process.env.NOTIFICATION_MONGO_PASSWORD },
  { db: process.env.MAINTENANCE_MONGO_DB, user: process.env.MAINTENANCE_MONGO_USER, pwd: process.env.MAINTENANCE_MONGO_PASSWORD },
];
for (const s of services) {
  const target = db.getSiblingDB(s.db);
  if (target.getUser(s.user)) {
    print(`>> User ${s.user} đã tồn tại trong ${s.db}, bỏ qua`);
    continue;
  }
  target.createUser({ user: s.user, pwd: s.pwd, roles: [{ role: 'readWrite', db: s.db }] });
  print(`>> Đã tạo user ${s.user} (readWrite) trên ${s.db}`);
}
EOJS
