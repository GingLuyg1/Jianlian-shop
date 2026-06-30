param(
  [switch]$KeyTablesOnly
)

$ErrorActionPreference = "Stop"

if (-not $env:DATABASE_URL) {
  throw "DATABASE_URL is required"
}
if (-not $env:BACKUP_OUTPUT_DIR) {
  throw "BACKUP_OUTPUT_DIR is required"
}
if (-not $env:BACKUP_ENCRYPTION_PASS) {
  throw "BACKUP_ENCRYPTION_PASS is required"
}
if (-not (Test-Path -LiteralPath $env:BACKUP_OUTPUT_DIR -PathType Container)) {
  throw "Backup output directory does not exist: $env:BACKUP_OUTPUT_DIR"
}

$envName = if ($env:APP_ENV) { $env:APP_ENV } else { "production" }
$version = if ($env:APP_VERSION) { $env:APP_VERSION } else { "unknown" }
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$scope = if ($KeyTablesOnly) { "database-key-tables" } else { "database-full" }
$baseName = "jianlian-$envName-$version-$stamp-$scope"
$rawFile = Join-Path $env:BACKUP_OUTPUT_DIR "$baseName.dump"
$gzipFile = "$rawFile.gz"
$encFile = "$gzipFile.enc"
$shaFile = "$encFile.sha256"

Write-Host "Starting database backup at $stamp"

if ($KeyTablesOnly) {
  $tables = @(
    "public.profiles",
    "public.orders",
    "public.order_items",
    "public.payment_sessions",
    "public.account_recharges",
    "public.balance_transactions",
    "public.refund_requests",
    "public.digital_inventory",
    "public.digital_inventory_batches",
    "public.order_deliveries",
    "public.admin_audit_logs"
  )
  $tableArgs = $tables | ForEach-Object { "--table=$_" }
  & pg_dump $env:DATABASE_URL --format=custom --no-owner --no-acl @tableArgs --file=$rawFile
} else {
  & pg_dump $env:DATABASE_URL --format=custom --no-owner --no-acl --file=$rawFile
}

Compress-Archive -LiteralPath $rawFile -DestinationPath $gzipFile -Force
Remove-Item -LiteralPath $rawFile -Force

& openssl enc -aes-256-cbc -salt -pbkdf2 -in $gzipFile -out $encFile -pass env:BACKUP_ENCRYPTION_PASS
Remove-Item -LiteralPath $gzipFile -Force

$hash = Get-FileHash -LiteralPath $encFile -Algorithm SHA256
"$($hash.Hash.ToLower())  $(Split-Path -Leaf $encFile)" | Set-Content -LiteralPath $shaFile -Encoding ASCII

Write-Host "Backup completed at $((Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ"))"
Write-Host "Encrypted file: $encFile"
Write-Host "Checksum file: $shaFile"
Write-Host "Size bytes: $((Get-Item -LiteralPath $encFile).Length)"
