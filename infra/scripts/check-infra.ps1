<#
.SYNOPSIS
  Kiem tra ha tang local (docker compose) va in OK/FAIL tung dong. Thoat 0 neu tat ca OK, 1 neu co FAIL.

.DESCRIPTION
  Chay tu bat ky thu muc nao:  pwsh/powershell -File infra/scripts/check-infra.ps1
  Doc mat khau tu .env goc. Cac kiem tra chay qua `docker exec` nen khong can cai psql/redis-cli/mongosh tren may.
  File nay CHI dung ky tu ASCII (PowerShell 5.1 doc UTF-8 khong BOM bi loi dau).

.PARAMETER EnvFile
  Duong dan .env (mac dinh: .env o goc repo).

.PARAMETER Demo
  Bat buoc kiem tra ca Elasticsearch/Kibana (neu khong, chi kiem tra khi chung dang chay).
#>
param(
  [string]$EnvFile = (Join-Path $PSScriptRoot '..\..\.env'),
  [switch]$Demo
)

$ErrorActionPreference = 'Continue'
$script:pass = 0
$script:fail = 0

function Write-Result {
  param([bool]$Ok, [string]$Name, [string]$Detail = '')
  if ($Ok) { $script:pass++; $tag = 'OK  '; $color = 'Green' } else { $script:fail++; $tag = 'FAIL'; $color = 'Red' }
  $line = "[$tag] $Name"
  if ($Detail) { $line += "  ($Detail)" }
  Write-Host $line -ForegroundColor $color
}

function Write-Skip {
  param([string]$Name, [string]$Why)
  Write-Host "[SKIP] $Name  ($Why)" -ForegroundColor Yellow
}

# Chay docker, tra ve @{ Out = stdout da trim; Code = exit code }. Bo qua stderr.
function Invoke-Docker {
  param([string[]]$DockerArgs)
  $out = & docker @DockerArgs 2>$null
  return @{ Out = (($out | Out-String).Trim()); Code = $LASTEXITCODE }
}

# ---------------- Nap .env ----------------
if (-not (Test-Path $EnvFile)) {
  Write-Host "[FAIL] Khong thay file .env: $EnvFile (chay: Copy-Item .env.example .env)" -ForegroundColor Red
  exit 1
}
$cfg = @{}
foreach ($line in Get-Content $EnvFile) {
  if ($line -match '^\s*([A-Za-z0-9_]+)=(.*)$') { $cfg[$Matches[1]] = $Matches[2].Trim() }
}

$r = Invoke-Docker @('info', '--format', '{{.ServerVersion}}')
if ($r.Code -ne 0) {
  Write-Host '[FAIL] Docker daemon khong chay (mo Docker Desktop roi chay lai)' -ForegroundColor Red
  exit 1
}

# ---------------- 1. Container healthy ----------------
Write-Host '== Container'
foreach ($c in 're-postgres', 're-redis', 're-rabbitmq', 're-mongo', 're-s3') {
  $r = Invoke-Docker @('inspect', '--format', '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}', $c)
  Write-Result ($r.Code -eq 0 -and $r.Out -eq 'healthy') "container $c healthy" "trang thai: $($r.Out)"
}
# rabbitmq-init la tac vu mot lan: dung khi Exited (0)
$r = Invoke-Docker @('inspect', '--format', '{{.State.Status}} {{.State.ExitCode}}', 're-rabbitmq-init')
Write-Result ($r.Code -eq 0 -and $r.Out -eq 'exited 0') 'container re-rabbitmq-init da chay xong (Exited 0)' "trang thai: $($r.Out)"
# Profile demo: chi kiem tra khi dang chay (hoac khi dung -Demo)
foreach ($c in 're-elasticsearch', 're-kibana') {
  $r = Invoke-Docker @('inspect', '--format', '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}', $c)
  if ($r.Code -eq 0 -and $r.Out -ne 'exited') {
    Write-Result ($r.Out -eq 'healthy') "container $c healthy" "trang thai: $($r.Out)"
  } elseif ($Demo) {
    Write-Result $false "container $c healthy" 'khong chay; bat bang: pnpm infra:demo'
  } else {
    Write-Skip "container $c" 'profile demo dang tat'
  }
}

# ---------------- 2. PostgreSQL ----------------
Write-Host '== PostgreSQL'
$svcs = 'IDENTITY', 'LISTING', 'RENTAL', 'PAYMENT'
foreach ($s in $svcs) {
  $user = $cfg["${s}_DB_USER"]; $db = $cfg["${s}_DB_NAME"]; $pw = $cfg["${s}_DB_PASSWORD"]
  # -h postgres: di qua mang container nen pg_hba bat buoc xac thuc mat khau (khong phai trust qua socket/loopback)
  $r = Invoke-Docker @('exec', '-e', "PGPASSWORD=$pw", 're-postgres', 'psql', '-h', 'postgres', '-U', $user, '-d', $db, '-tAc', 'select 1')
  Write-Result ($r.Out -eq '1') "postgres: $user dang nhap duoc vao $db"
}
foreach ($s in $svcs) {
  $user = $cfg["${s}_DB_USER"]; $db = $cfg["${s}_DB_NAME"]
  $sql = "select coalesce(string_agg(datname, ',' order by datname), '') from pg_database where datallowconn and has_database_privilege('$user', datname, 'CONNECT')"
  $r = Invoke-Docker @('exec', 're-postgres', 'psql', '-U', $cfg['POSTGRES_SUPERUSER'], '-d', 'postgres', '-tAc', $sql)
  Write-Result ($r.Out -eq $db) "postgres: $user chi duoc CONNECT vao $db" "thuc te: $($r.Out)"
}
$r = Invoke-Docker @('exec', '-e', "PGPASSWORD=$($cfg['LISTING_DB_PASSWORD'])", 're-postgres', 'psql', '-h', 'postgres', '-U', $cfg['LISTING_DB_USER'], '-d', $cfg['LISTING_DB_NAME'], '-tAc', 'select postgis_version()')
Write-Result ($r.Code -eq 0 -and $r.Out -match '^\d') "postgres: postgis_version() trong $($cfg['LISTING_DB_NAME'])" $r.Out

# ---------------- 3. Redis ----------------
Write-Host '== Redis'
$r = Invoke-Docker @('exec', 're-redis', 'redis-cli', 'ping')
Write-Result ($r.Out -eq 'PONG') 'redis: PING (co mat khau) tra ve PONG' $r.Out
$r = Invoke-Docker @('exec', 're-redis', 'sh', '-c', 'unset REDISCLI_AUTH; redis-cli ping')
Write-Result ($r.Out -match 'NOAUTH') 'redis: tu choi khi khong co mat khau' $r.Out

# ---------------- 4. MongoDB ----------------
Write-Host '== MongoDB'
$r = Invoke-Docker @('exec', 're-mongo', 'mongosh', '--quiet', '-u', $cfg['MONGO_ROOT_USER'], '-p', $cfg['MONGO_ROOT_PASSWORD'], '--authenticationDatabase', 'admin', '--eval', "db.adminCommand('ping').ok")
Write-Result ($r.Out -eq '1') 'mongo: ping (root)' $r.Out
foreach ($s in 'NOTIFICATION', 'MAINTENANCE') {
  $user = $cfg["${s}_MONGO_USER"]; $db = $cfg["${s}_MONGO_DB"]; $pw = $cfg["${s}_MONGO_PASSWORD"]
  $r = Invoke-Docker @('exec', 're-mongo', 'mongosh', '--quiet', '-u', $user, '-p', $pw, '--authenticationDatabase', $db, "127.0.0.1:27017/$db", '--eval', 'db.runCommand({connectionStatus:1}).authInfo.authenticatedUsers[0].user')
  Write-Result ($r.Out -eq $user) "mongo: $user dang nhap duoc vao $db" $r.Out
}

# ---------------- 5. RabbitMQ ----------------
Write-Host '== RabbitMQ'
$ex = (Invoke-Docker @('exec', 're-rabbitmq', 'rabbitmqctl', 'list_exchanges', 'name', '--no-table-headers')).Out -split "`n" | ForEach-Object { $_.Trim() }
foreach ($e in 'domain.events', 'domain.events.dlx') {
  Write-Result ($ex -contains $e) "rabbitmq: exchange $e ton tai"
}
$qs = (Invoke-Docker @('exec', 're-rabbitmq', 'rabbitmqctl', 'list_queues', 'name', '--no-table-headers')).Out -split "`n" | ForEach-Object { $_.Trim() }
foreach ($q in 'listing.indexer', 'notification.events', 'rental.payment-events') {
  Write-Result ($qs -contains $q) "rabbitmq: queue $q ton tai"
  Write-Result ($qs -contains "$q.dlq") "rabbitmq: queue $q.dlq ton tai"
}

# ---------------- 6. S3 (Silo) ----------------
Write-Host '== S3 (Silo)'
$s3port = if ($cfg['S3_API_PORT']) { $cfg['S3_API_PORT'] } else { '9000' }
foreach ($ep in 'live', 'ready') {
  try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$s3port/minio/health/$ep" -UseBasicParsing -TimeoutSec 5
    Write-Result ($resp.StatusCode -eq 200) "s3: /minio/health/$ep" "HTTP $($resp.StatusCode)"
  } catch {
    Write-Result $false "s3: /minio/health/$ep" $_.Exception.Message
  }
}

# ---------------- Tong ket ----------------
Write-Host ''
$total = $script:pass + $script:fail
if ($script:fail -eq 0) {
  Write-Host "KET QUA: $($script:pass)/$total OK" -ForegroundColor Green
  exit 0
} else {
  Write-Host "KET QUA: $($script:fail) FAIL, $($script:pass) OK (tong $total)" -ForegroundColor Red
  exit 1
}
