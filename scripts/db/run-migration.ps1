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
$TestProjectRef = "czuoivbfxzachiobdohw"
$ProductionProjectRef = "qvbovrvybirscaurwuov"
$startedAt = [DateTimeOffset]::UtcNow
$resolvedFile = $null
$actualSha256 = $null
$outcome = "failed"
$exitCode = 1
$libpqEnvironmentVariables = @(
  "PGHOST", "PGHOSTADDR", "PGPORT", "PGUSER", "PGPASSWORD",
  "PGSERVICE", "PGSERVICEFILE", "PGPASSFILE", "PGOPTIONS",
  "PGSSLMODE", "PGREQUIRESSL", "PGCHANNELBINDING", "PGSSLCOMPRESSION",
  "PGSSLCERT", "PGSSLKEY", "PGSSLROOTCERT", "PGSSLCRL", "PGSSLCRLDIR",
  "PGREQUIREPEER", "PGCLIENTENCODING", "PGKRBSRVNAME", "PGGSSLIB",
  "PGTARGETSESSIONATTRS", "PGDATABASE", "PGCONNECT_TIMEOUT", "PGAPPNAME"
)
$originalLibpqEnvironment = @{}
foreach ($name in $libpqEnvironmentVariables) {
  $originalLibpqEnvironment[$name] = [ordered]@{
    existed = [Environment]::GetEnvironmentVariable($name, "Process") -ne $null
    value = [Environment]::GetEnvironmentVariable($name, "Process")
  }
}

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

function Assert-SqlTransactionEnvelope {
  param([string]$Sql)
  $withoutBlockComments = [Regex]::Replace($Sql, "(?s)/\*.*?\*/", " ")
  $withoutLineComments = [Regex]::Replace($withoutBlockComments, "(?m)--[^\r\n]*", " ")
  $statements = @(
    $withoutLineComments.Split(";") |
      ForEach-Object { $_.Trim() } |
      Where-Object { $_.Length -gt 0 }
  )
  if (
    $statements.Count -lt 2 -or
    $statements[0] -notmatch "(?is)^begin(?:\s+transaction)?$" -or
    $statements[$statements.Count - 1] -notmatch "(?is)^commit(?:\s+transaction)?$"
  ) {
    throw "MIGRATION_TRANSACTION_BOUNDARY_REQUIRED"
  }
}

function Assert-DatabaseTarget {
  param([string]$DatabaseUrl)
  try {
    $uri = [Uri]$DatabaseUrl
  } catch {
    throw "DATABASE_URL_INVALID"
  }
  if ($uri.Scheme -notin @("postgres", "postgresql")) {
    throw "DATABASE_URL_INVALID"
  }
  if ($uri.Query -or $uri.Fragment) {
    throw "DATABASE_URL_OPTIONS_NOT_ALLOWED"
  }
  if ($uri.AbsolutePath -cne "/postgres") {
    throw "DATABASE_NAME_NOT_ALLOWED"
  }
  $hostName = $uri.DnsSafeHost.ToLowerInvariant()
  $directHost = "db.$ProjectRef.supabase.co"
  $isDirect = $hostName -ceq $directHost
  $isOfficialPooler = $hostName -match "^[a-z0-9-]+\.pooler\.supabase\.com$"

  if (-not $isDirect -and -not $isOfficialPooler) {
    throw "DATABASE_HOST_NOT_ALLOWED"
  }
  $userInfo = $uri.UserInfo
  $encodedUserName = if ($userInfo.Contains(":")) { $userInfo.Split(":", 2)[0] } else { $userInfo }
  $userName = [Uri]::UnescapeDataString($encodedUserName)
  if ($isDirect) {
    if ($uri.Port -ne 5432) {
      throw "DATABASE_PORT_NOT_ALLOWED"
    }
    if ($userName -cne "postgres") {
      throw "DATABASE_USERNAME_PROJECT_REF_MISMATCH"
    }
  } else {
    if ($uri.Port -notin @(5432, 6543)) {
      throw "DATABASE_PORT_NOT_ALLOWED"
    }
    if ($userName -cne "postgres.$ProjectRef") {
      throw "DATABASE_POOLER_USERNAME_PROJECT_REF_MISMATCH"
    }
  }
}

try {
  if ($Execute -and $ValidateOnly) {
    throw "MIGRATION_MODE_CONFLICT"
  }
  $expectedRef = if ($Environment -eq "production") { $ProductionProjectRef } else { $TestProjectRef }
  if ($ProjectRef -cne $expectedRef) {
    throw "ENVIRONMENT_PROJECT_REF_MISMATCH"
  }
  if (-not (Test-Path -LiteralPath $File -PathType Leaf)) {
    throw "MIGRATION_FILE_NOT_FOUND"
  }
  $resolvedFile = (Resolve-Path -LiteralPath $File).Path
  $actualSha256 = (Get-FileHash -LiteralPath $resolvedFile -Algorithm SHA256).Hash.ToUpperInvariant()
  if ($actualSha256 -ne $ExpectedSha256.ToUpperInvariant()) {
    throw "MIGRATION_SHA256_MISMATCH"
  }

  $sql = Get-Content -LiteralPath $resolvedFile -Raw -Encoding UTF8
  Assert-SqlTransactionEnvelope -Sql $sql
  if ($sql -match "(?m)^\s*\\") {
    throw "MIGRATION_PSQL_META_COMMAND_NOT_SUPPORTED"
  }

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

  $databaseUrlVariable = if ($DatabaseUrlEnvironmentVariable) {
    $DatabaseUrlEnvironmentVariable
  } elseif ($Environment -eq "production") {
    "SUPABASE_DB_URL_PRODUCTION"
  } else {
    "SUPABASE_DB_URL_TEST"
  }
  $databaseUrl = [Environment]::GetEnvironmentVariable($databaseUrlVariable)
  if (-not $databaseUrl) {
    throw "DATABASE_URL_ENVIRONMENT_VARIABLE_MISSING"
  }
  Assert-DatabaseTarget -DatabaseUrl $databaseUrl

  # Remove every inherited libpq override before setting the validated target.
  foreach ($name in $libpqEnvironmentVariables) {
    [Environment]::SetEnvironmentVariable($name, $null, "Process")
  }
  # Credentials remain in the child process environment, never in arguments or logs.
  $env:PGDATABASE = $databaseUrl
  $env:PGSSLMODE = "require"
  $env:PGCONNECT_TIMEOUT = "15"
  $env:PGAPPNAME = "jianlian-migration-runner"
  & $PsqlCommand -X --no-psqlrc --set=ON_ERROR_STOP=1 --tuples-only --quiet --command="select current_database(), current_user;"
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
  foreach ($name in $libpqEnvironmentVariables) {
    $saved = $originalLibpqEnvironment[$name]
    if ($saved.existed) {
      [Environment]::SetEnvironmentVariable($name, [string]$saved.value, "Process")
    } else {
      [Environment]::SetEnvironmentVariable($name, $null, "Process")
    }
  }
}
