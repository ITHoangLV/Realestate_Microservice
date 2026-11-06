#!/bin/bash
# =============================================================================
# Khởi tạo 4 database + 4 user riêng cho Postgres (chạy bởi docker-entrypoint-initdb.d).
#
# - CHỈ chạy ở lần đầu, khi thư mục dữ liệu còn trống. Muốn chạy lại phải xóa volume:
#     pnpm infra:down ; docker volume rm realestate_postgres_data
# - Mật khẩu/tên lấy từ biến môi trường (compose truyền từ .env), không hard-code.
# - Mỗi user chỉ kết nối được DB của mình: REVOKE CONNECT từ PUBLIC trên mọi DB
#   (kể cả postgres, template1), rồi GRANT CONNECT riêng cho owner.
# - listing_db bật postgis, pgcrypto, uuid-ossp (superuser tạo vì postgis không "trusted").
# File này PHẢI dùng LF (xem .gitattributes).
# =============================================================================
set -Eeuo pipefail

# Dừng sớm, báo rõ nếu thiếu biến.
: "${POSTGRES_USER:?thiếu POSTGRES_USER}"
for v in IDENTITY LISTING RENTAL PAYMENT; do
  for suffix in DB_NAME DB_USER DB_PASSWORD; do
    name="${v}_${suffix}"
    if [ -z "${!name:-}" ]; then
      echo "LỖI: thiếu biến môi trường ${name}" >&2
      exit 1
    fi
  done
done

# create_db <tên_db> <tên_user> <mật_khẩu>
# Dùng biến psql (:"ident" / :'literal') để quote đúng, mật khẩu có ký tự lạ vẫn an toàn.
create_db() {
  local db="$1" usr="$2" pw="$3"
  echo ">> Tạo role '${usr}' và database '${db}'"
  psql -v ON_ERROR_STOP=1 -v db="$db" -v usr="$usr" -v pw="$pw" \
    --username "$POSTGRES_USER" --dbname postgres <<'EOSQL'
CREATE ROLE :"usr" LOGIN PASSWORD :'pw' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE :"db" OWNER :"usr";
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO :"usr";
EOSQL
}

create_db "$IDENTITY_DB_NAME" "$IDENTITY_DB_USER" "$IDENTITY_DB_PASSWORD"
create_db "$LISTING_DB_NAME"  "$LISTING_DB_USER"  "$LISTING_DB_PASSWORD"
create_db "$RENTAL_DB_NAME"   "$RENTAL_DB_USER"   "$RENTAL_DB_PASSWORD"
create_db "$PAYMENT_DB_NAME"  "$PAYMENT_DB_USER"  "$PAYMENT_DB_PASSWORD"

# Chặn user ứng dụng vào DB hệ thống (mặc định PUBLIC được CONNECT vào postgres/template1).
echo ">> Thu hồi CONNECT của PUBLIC trên postgres và template1"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<'EOSQL'
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
REVOKE CONNECT ON DATABASE template1 FROM PUBLIC;
EOSQL

# Extension cho listing_db (tạo bằng superuser).
echo ">> Bật extension cho ${LISTING_DB_NAME}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$LISTING_DB_NAME" <<'EOSQL'
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
EOSQL

echo ">> Hoàn tất khởi tạo Postgres"
