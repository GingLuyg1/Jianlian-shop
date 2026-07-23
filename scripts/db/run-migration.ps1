[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$File,

  [Parameter(Mandatory = $true)]
  [ValidateSet("test", "production")]
  [string]$Environment,

  [Parameter(Mandatory = $true)]
  [ValidatePattern("^[a-z0-9]{20}$")]
  [string]$ProjectRef,

  [Parameter(Mandatory = $true)]
  [ValidatePattern("^[A-Fa-f0-9]{64}$")]
  [string]$ExpectedSha256,

  [switch]$Execute,
  [switch]$ValidateOnly,
  [string]$ConfirmationText = "",
  [string]$PsqlCommand = "psql",
  [string]$DatabaseUrlEnvironmentVariable = ""
)

$ErrorActionPreference = "Stop"
$startedAt = [DateTimeOffset]::UtcNow
$resolvedFile = $null
$actualSha256 = $null
$outcome = "failed"
$exitCode = 1
$originalPgDatabase = $env:PGDATABASE

function Write-SafeRunRecord {
  param([string]$Result, [int]$Code)
  $record = [ordered]@{
    file = if ($resolvedFile) { [IO.Path]::GetFileName($resolvedFile) } else { [IO.Path]::GetFileName($File) }
    sha256 = $actualSha256
    executed_at_utc = $startedAt.ToString("o")
    project_ref = $ProjectRef
    environment = $Environment
    mode = if ($Execute) { "execute" } elseif ($ValidateOnly) { "validate_only" } else { "dry_run" }
    result = $Result
    exit_code = $Code
  }
  $logDirectory = Join-Path ([IO.Path]::GetTempPath()) "jianlian-migration-logs"
  New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
  $logFile = Join-Path $logDirectory "migration-runs.jsonl"
  Add-Content -LiteralPath $logFile -Value ($record | ConvertTo-Json -Compress) -Encoding UTF8
  $record | ConvertTo-Json
}

try {
  if (-not (Test-Path -LiteralPath $File -PathType Leaf)) {
    throw "MIGRATION_FILE_NOT_FOUND"
  }
  $resolvedFile = (Resolve-Path -LiteralPath $File).Path
  $actualSha256 = (Get-FileHash -LiteralPath $resolvedFile -Algorithm SHA256).Hash.ToUpperInvariant()
  if ($actualSha256 -ne $ExpectedSha256.ToUpperInvariant()) {
    throw "MIGRATION_SHA256_MISMATCH"
  }

  $sql = Get-Content -LiteralPath $resolvedFile -Raw -Encoding UTF8
  if ($sql -notmatch "(?im)^\s*begin\s*;" -or $sql -notmatch "(?im)^\s*commit\s*;") {
    throw "MIGRATION_TRANSACTION_BOUNDARY_REQUIRED"
  }
  if ($sql -match "(?m)^\s*\\") {
    throw "MIGRATION_PSQL_META_COMMAND_NOT_SUPPORTED"
  }

  $databaseUrlVariable = if ($DatabaseUrlEnvironmentVariable) {
    $DatabaseUrlEnvironmentVariable
  } elseif ($Environment -eq "production") {
    "SUPABASE_DB_URL_PRODUCTION"
  } else {
    "SUPABASE_DB_URL_TEST"
  }
  $databaseUrl = [Environment]::GetEnvironmentVariable($databaseUrlVariable)

  if ($Execute -and $Environment -eq "production") {
    $expectedConfirmation = "EXECUTE PRODUCTION MIGRATION $ProjectRef $([IO.Path]::GetFileName($resolvedFile)) $actualSha256"
    if ($ConfirmationText -cne $expectedConfirmation) {
      throw "PRODUCTION_CONFIRMATION_TEXT_INVALID"
    }
  }

  Write-Host "Migration file: $([IO.Path]::GetFileName($resolvedFile))"
  Write-Host "SHA-256: $actualSha256"
  Write-Host "Environment: $Environment"
  Write-Host "Project ref: $ProjectRef"

  if ($ValidateOnly) {
    $outcome = "validated"
    $exitCode = 0
    Write-SafeRunRecord -Result $outcome -Code $exitCode
    exit $exitCode
  }

  if (-not $databaseUrl) {
    throw "DATABASE_URL_ENVIRONMENT_VARIABLE_MISSING"
  }
  $databaseUri = [Uri]$databaseUrl
  if ($databaseUri.Host -notmatch [Regex]::Escape($ProjectRef)) {
    throw "DATABASE_PROJECT_REF_MISMATCH"
  }

  # PGDATABASE carries the connection string in the child process environment,
  # keeping credentials out of command arguments and logs.
  $env:PGDATABASE = $databaseUrl
  & $PsqlCommand -X --no-psqlrc --set=ON_ERROR_STOP=1 --tuples-only --quiet --command="select 1;"
  if ($LASTEXITCODE -ne 0) {
    $exitCode = $LASTEXITCODE
    throw "DATABASE_CONNECTION_TEST_FAILED"
  }

  if (-not $Execute) {
    $outcome = "dry_run_validated"
    $exitCode = 0
    Write-SafeRunRecord -Result $outcome -Code $exitCode
    exit $exitCode
  }

  & $PsqlCommand -X --no-psqlrc --set=ON_ERROR_STOP=1 --file=$resolvedFile
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "MIGRATION_PSQL_EXECUTION_FAILED"
  }

  $outcome = "success"
  Write-SafeRunRecord -Result $outcome -Code 0
  exit 0
} catch {
  $safeCode = if ($_.Exception.Message -match "^[A-Z0-9_]+$") {
    $_.Exception.Message
  } else {
    "MIGRATION_RUNNER_FAILED"
  }
  [Console]::Error.WriteLine($safeCode)
  Write-SafeRunRecord -Result $outcome -Code $exitCode
  exit $exitCode
} finally {
  $env:PGDATABASE = $originalPgDatabase
}

