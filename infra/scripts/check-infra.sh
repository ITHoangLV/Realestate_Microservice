#!/usr/bin/env bash
# =============================================================================
# Kiểm tra hạ tầng local (docker compose) và in OK/FAIL từng dòng.
# Thoát 0 nếu tất cả OK, 1 nếu có FAIL.
#
#   bash infra/scripts/check-infra.sh            # kiểm tra profile dev (+ demo nếu đang chạy)
#   bash infra/scripts/check-infra.sh --demo     # bắt buộc kiểm tra cả Elasticsearch/Kibana
#
# Đọc mật khẩu từ .env gốc. Mọi kiểm tra chạy qua `docker exec`, không cần cài psql/redis-cli/mongosh.
# File này PHẢI dùng LF (xem .gitattributes).
# =============================================================================
set -u
export MSYS_NO_PATHCONV=1   # Git Bash trên Windows: không tự đổi đường dẫn trong đối số docker

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/../../.env}"
FORCE_DEMO=0
[ "${1:-}" = "--demo" ] && FORCE_DEMO=1

pass=0
fail=0
if [ -t 1 ]; then G=$'\033[32m'; R=$'\033[31m'; Y=$'\033[33m'; N=$'\033[0m'; else G=''; R=''; Y=''; N=''; fi

report() { # report <0|1 thành công?> <tên> [chi tiết]
  local ok="$1" name="$2" detail="${3:-}"
  [ -n "$detail" ] && detail="  ($detail)"
  if [ "$ok" = "1" ]; then pass=$((pass + 1)); printf '%s[OK  ]%s %s%s\n' "$G" "$N" "$name" "$detail"
  else fail=$((fail + 1)); printf '%s[FAIL]%s %s%s\n' "$R" "$N" "$name" "$detail"; fi
}
skip() { printf '%s[SKIP]%s %s  (%s)\n' "$Y" "$N" "$1" "$2"; }
eq() { [ "$1" = "$2" ] && echo 1 || echo 0; }

if [ ! -f "$ENV_FILE" ]; then
  printf '%s[FAIL]%s Không thấy file .env: %s (chạy: cp .env.example .env)\n' "$R" "$N" "$ENV_FILE"
  exit 1
fi
set -a
# shellcheck disable=SC1090
. <(tr -d '\r' < "$ENV_FILE")
set +a

if ! docker info >/dev/null 2>&1; then
  printf '%s[FAIL]%s Docker daemon không chạy (mở Docker Desktop rồi chạy lại)\n' "$R" "$N"
  exit 1
fi

health() { docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$1" 2>/dev/null; }

echo "== Container"
for c in re-postgres re-redis re-rabbitmq re-mongo re-s3; do
  st="$(health "$c")"
  report "$(eq "$st" healthy)" "container $c healthy" "trạng thái: ${st:-không tồn tại}"
done
st="$(docker inspect --format '{{.State.Status}} {{.State.ExitCode}}' re-rabbitmq-init 2>/dev/null)"
report "$(eq "$st" 'exited 0')" "container re-rabbitmq-init đã chạy xong (Exited 0)" "trạng thái: ${st:-không tồn tại}"
for c in re-elasticsearch re-kibana; do
  st="$(health "$c")"
  if [ -n "$st" ] && [ "$st" != "exited" ]; then
    report "$(eq "$st" healthy)" "container $c healthy" "trạng thái: $st"
  elif [ "$FORCE_DEMO" = "1" ]; then
    report 0 "container $c healthy" "không chạy; bật bằng: pnpm infra:demo"
  else
    skip "container $c" "profile demo đang tắt"
  fi
done

echo "== PostgreSQL"
for s in IDENTITY LISTING RENTAL PAYMENT; do
  u="${s}_DB_USER"; d="${s}_DB_NAME"; p="${s}_DB_PASSWORD"
  # -h postgres: đi qua mạng container nên pg_hba bắt buộc xác thực mật khẩu
  out="$(docker exec -e PGPASSWORD="${!p}" re-postgres psql -h postgres -U "${!u}" -d "${!d}" -tAc 'select 1' 2>/dev/null | tr -d '[:space:]')"
  report "$(eq "$out" 1)" "postgres: ${!u} đăng nhập được vào ${!d}"
done
for s in IDENTITY LISTING RENTAL PAYMENT; do
  u="${s}_DB_USER"; d="${s}_DB_NAME"
  sql="select coalesce(string_agg(datname, ',' order by datname), '') from pg_database where datallowconn and has_database_privilege('${!u}', datname, 'CONNECT')"
  out="$(docker exec re-postgres psql -U "$POSTGRES_SUPERUSER" -d postgres -tAc "$sql" 2>/dev/null | tr -d '[:space:]')"
  report "$(eq "$out" "${!d}")" "postgres: ${!u} chỉ được CONNECT vào ${!d}" "thực tế: $out"
done
out="$(docker exec -e PGPASSWORD="$LISTING_DB_PASSWORD" re-postgres psql -h postgres -U "$LISTING_DB_USER" -d "$LISTING_DB_NAME" -tAc 'select postgis_version()' 2>/dev/null | head -n1)"
case "$out" in [0-9]*) ok=1 ;; *) ok=0 ;; esac
report "$ok" "postgres: postgis_version() trong $LISTING_DB_NAME" "$out"

echo "== Redis"
out="$(docker exec re-redis redis-cli ping 2>/dev/null | tr -d '[:space:]')"
report "$(eq "$out" PONG)" "redis: PING (có mật khẩu) trả về PONG" "$out"
out="$(docker exec re-redis sh -c 'unset REDISCLI_AUTH; redis-cli ping' 2>/dev/null)"
case "$out" in *NOAUTH*) ok=1 ;; *) ok=0 ;; esac
report "$ok" "redis: từ chối khi không có mật khẩu" "$out"

echo "== MongoDB"
out="$(docker exec re-mongo mongosh --quiet -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin --eval "db.adminCommand('ping').ok" 2>/dev/null | tr -d '[:space:]')"
report "$(eq "$out" 1)" "mongo: ping (root)" "$out"
for s in NOTIFICATION MAINTENANCE; do
  u="${s}_MONGO_USER"; d="${s}_MONGO_DB"; p="${s}_MONGO_PASSWORD"
  out="$(docker exec re-mongo mongosh --quiet -u "${!u}" -p "${!p}" --authenticationDatabase "${!d}" "127.0.0.1:27017/${!d}" --eval 'db.runCommand({connectionStatus:1}).authInfo.authenticatedUsers[0].user' 2>/dev/null | tr -d '[:space:]')"
  report "$(eq "$out" "${!u}")" "mongo: ${!u} đăng nhập được vào ${!d}" "$out"
done

echo "== RabbitMQ"
exchanges="$(docker exec re-rabbitmq rabbitmqctl list_exchanges name --no-table-headers 2>/dev/null | tr -d '\r')"
for e in domain.events domain.events.dlx; do
  echo "$exchanges" | grep -qx "$e" && ok=1 || ok=0
  report "$ok" "rabbitmq: exchange $e tồn tại"
done
queues="$(docker exec re-rabbitmq rabbitmqctl list_queues name --no-table-headers 2>/dev/null | tr -d '\r')"
for q in listing.indexer notification.events rental.payment-events; do
  echo "$queues" | grep -qx "$q" && ok=1 || ok=0
  report "$ok" "rabbitmq: queue $q tồn tại"
  echo "$queues" | grep -qx "$q.dlq" && ok=1 || ok=0
  report "$ok" "rabbitmq: queue $q.dlq tồn tại"
done

echo "== S3 (Silo)"
port="${S3_API_PORT:-9000}"
for ep in live ready; do
  code="$(curl -s -o /dev/null -m 5 -w '%{http_code}' "http://127.0.0.1:${port}/minio/health/${ep}" 2>/dev/null)"
  report "$(eq "$code" 200)" "s3: /minio/health/$ep" "HTTP ${code:-000}"
done

echo
total=$((pass + fail))
if [ "$fail" -eq 0 ]; then
  printf '%sKẾT QUẢ: %d/%d OK%s\n' "$G" "$pass" "$total" "$N"
  exit 0
else
  printf '%sKẾT QUẢ: %d FAIL, %d OK (tổng %d)%s\n' "$R" "$fail" "$pass" "$total" "$N"
  exit 1
fi
