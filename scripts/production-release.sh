#!/usr/bin/env bash
set -Eeuo pipefail

REPO=/www/jianlian-shop
RELEASE_ROOT=/www/releases
APP_NAME=jianlian-shop
SMOKE_PORT=3002
PRODUCTION_PORT=3001
ENV_SOURCE="$REPO/.env.local"
MIN_FREE_KB="${JIANLIAN_MIN_FREE_KB:-3145728}"
MIN_FREE_INODES="${JIANLIAN_MIN_FREE_INODES:-150000}"

CORE_ENV=(
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SECRET_KEY
  DAJU_API_BASE_URL
  DAJU_API_KEY
)

KNOWN_OPTIONAL_ENV=(
  SUPABASE_SERVICE_ROLE_KEY SUPABASE_SERVICE_ROLE SUPABASE_SECRET SUPABASE_SERVICE_KEY
  CRON_SECRET INTERNAL_JOB_SECRET ORDER_EXPIRATION_JOB_SECRET BEP20_UNDERPAYMENT_JOB_SECRET
  BSC_RPC_URL BSC_CHAIN_ID BSC_USDT_CONTRACT BSC_USDT_DECIMALS BSC_RECEIVE_ADDRESS
  BSC_REQUIRED_CONFIRMATIONS BSC_PAYMENT_EXPIRE_MINUTES USDT_PRICING_MODE CNY_USDT_FIXED_RATE
  CNY_USDT_RATE_TTL_SECONDS USDT_AMOUNT_SCALE BSC_EXPLORER_BASE_URL
  EMAIL_PROVIDER MAIL_PROVIDER EMAIL_FROM MAIL_FROM RESEND_API_KEY POSTMARK_SERVER_TOKEN
  EMAIL_CUSTOM_ENDPOINT EMAIL_WORKER_SECRET PAYMENT_RECONCILIATION_SECRET INTERNAL_API_SECRET
  DATA_CONSISTENCY_SCAN_SECRET MONITORING_WEBHOOK_URL ALERT_WEBHOOK_URL
  APP_VERSION GIT_COMMIT BUILD_TIME APP_ENV
)

die() { printf 'BLOCKED: %s\n' "$*" >&2; exit 1; }
status() { printf '%s=%s\n' "$1" "$2"; }

usage() {
  cat <<'EOF'
Usage:
  production-release.sh preflight <full_sha> <rollback_release_path>
  production-release.sh prepare   <full_sha> <rollback_release_path>
  production-release.sh retry-build <full_sha>
  production-release.sh smoke     <full_sha>
  production-release.sh switch    <full_sha>
  production-release.sh rollback  <rollback_release_path>
  production-release.sh cleanup   <full_sha> <rollback_release_path> --confirm

No command runs SQL, migrations, npm audit fix, or changes Nginx.
EOF
}

require_tools() {
  local tool
  for tool in git df pm2 readlink curl npm install grep stat chmod awk find node tee ss sha256sum seq sleep sort tr cmp mkdir rm cat; do
    command -v "$tool" >/dev/null 2>&1 || die "required tool is missing: $tool"
  done
}

full_sha() {
  local input="${1:-}"
  [[ "$input" =~ ^[0-9a-fA-F]{40}$ ]] || die "target commit must be a full 40-character SHA"
  git -C "$REPO" cat-file -e "${input}^{commit}" 2>/dev/null || die "target commit does not exist in persistent repository"
  git -C "$REPO" rev-parse "${input}^{commit}"
}

release_path_for_sha() { printf '%s/jianlian-shop-%s\n' "$RELEASE_ROOT" "$1"; }

assert_release_path() {
  local resolved
  [[ "${1:-}" =~ ^/www/releases/jianlian-shop-[0-9a-f]{40}$ ]] || die "release path must use an exact full SHA"
  resolved="$(readlink -m -- "$1")"
  [[ "$resolved" == "$1" ]] || die "release path is not canonical"
}

current_pm2_cwd() {
  local pid
  pid="$(pm2 pid "$APP_NAME" 2>/dev/null | tr -d '[:space:]')"
  [[ "$pid" =~ ^[0-9]+$ ]] && [[ "$pid" != 0 ]] || die "PM2 process $APP_NAME is not running"
  readlink -f "/proc/$pid/cwd"
}

env_present() {
  local file="$1" name="$2"
  awk -v key="$name" '
    $0 ~ "^[[:space:]]*" key "[[:space:]]*=" {
      value = $0
      sub("^[^=]*=[[:space:]]*", "", value)
      sub("[[:space:]]+$", "", value)
      if (value != "" && value != "\047\047" && value != "\"\"") found = 1
    }
    END { exit(found ? 0 : 1) }
  ' "$file"
}

env_value() {
  local file="$1" name="$2"
  awk -v key="$name" '
    $0 ~ "^[[:space:]]*" key "[[:space:]]*=" {
      value = $0
      sub("^[^=]*=[[:space:]]*", "", value)
      sub("[[:space:]]+$", "", value)
      found = 1
    }
    END { if (found) printf "%s", value }
  ' "$file"
}

report_env() {
  local file="$1" name missing=0
  [[ -f "$file" ]] || die "production environment source is missing"
  [[ "$(stat -c '%a' "$file")" == 600 ]] || die "production environment source permissions must be 600"
  for name in "${CORE_ENV[@]}"; do
    if env_present "$file" "$name"; then status "$name" PRESENT; else status "$name" MISSING; missing=1; fi
  done
  for name in "${KNOWN_OPTIONAL_ENV[@]}"; do
    if env_present "$file" "$name"; then status "$name" PRESENT; else status "$name" MISSING; fi
  done
  [[ "$missing" == 0 ]] || die "one or more required Production variables are missing"
}

assert_persistent_env_matches_current() {
  local current_cwd current_env name persistent_value current_value drift=0
  current_cwd="$(current_pm2_cwd)"
  current_env="$current_cwd/.env.production.local"
  [[ -f "$current_env" ]] || die "current Production release environment is missing"
  [[ "$(stat -c '%a' "$current_env")" == 600 ]] || die "current Production release environment permissions must be 600"
  for name in "${CORE_ENV[@]}"; do
    persistent_value="$(env_value "$ENV_SOURCE" "$name")"
    current_value="$(env_value "$current_env" "$name")"
    if [[ -n "$persistent_value" && "$persistent_value" == "$current_value" ]]; then
      status "${name}_CONSISTENCY" MATCH
    else
      status "${name}_CONSISTENCY" DRIFT
      drift=1
    fi
  done
  [[ "$drift" == 0 ]] || die "persistent and current Production environments differ for required variables"
  [[ "$(sha256sum "$ENV_SOURCE" | awk '{print $1}')" == "$(sha256sum "$current_env" | awk '{print $1}')" ]] || die "persistent and current Production environment files differ; reconcile explicitly before release"
  status FULL_ENV_CONSISTENCY MATCH
}

assert_release_env_matches_source() {
  local release_env="$1"
  [[ -f "$ENV_SOURCE" && ! -L "$ENV_SOURCE" ]] || die "persistent Production environment source must be a regular file"
  [[ "$(sha256sum "$ENV_SOURCE" | awk '{print $1}')" == "$(sha256sum "$release_env" | awk '{print $1}')" ]] || die "release environment differs from persistent Production source; prepare and smoke again"
}

ensure_env_source() {
  local current_cwd fallback
  if [[ ! -f "$ENV_SOURCE" ]]; then
    current_cwd="$(current_pm2_cwd)"
    fallback="$current_cwd/.env.production.local"
    [[ -f "$fallback" ]] || die "neither persistent env source nor current release fallback exists"
    install -m 600 -- "$fallback" "$ENV_SOURCE"
    status ENV_SOURCE_BOOTSTRAPPED PRESENT
  fi
  chmod 600 "$ENV_SOURCE"
  report_env "$ENV_SOURCE"
  assert_persistent_env_matches_current
}

preflight_env() {
  local current_cwd fallback
  if [[ -f "$ENV_SOURCE" ]]; then
    status ENV_SOURCE PERSISTENT
    report_env "$ENV_SOURCE"
    assert_persistent_env_matches_current
    return
  fi
  current_cwd="$(current_pm2_cwd)"
  fallback="$current_cwd/.env.production.local"
  status ENV_SOURCE MISSING
  [[ -f "$fallback" ]] || die "persistent env source is missing and current release has no fallback"
  status ENV_BOOTSTRAP_SOURCE CURRENT_RELEASE
  report_env "$fallback"
}

verify_release_tree() {
  local sha="$1" target="$2"
  [[ "$(git -C "$target" rev-parse HEAD)" == "$sha" ]] || die "release Git SHA mismatch"
  [[ -z "$(git -C "$target" status --porcelain --untracked-files=no)" ]] || die "tracked release files are modified"
}

verify_runtime_release() {
  local target="$1" sha
  assert_release_path "$target"
  sha="${target##*-}"
  git -C "$REPO" cat-file -e "${sha}^{commit}" 2>/dev/null || die "release commit does not exist in persistent repository"
  [[ -d "$target" && ! -L "$target/.next" && -d "$target/.next" && -f "$target/.next/BUILD_ID" && ! -L "$target/.next/BUILD_ID" ]] || die "release build output is incomplete"
  [[ -f "$target/.env.production.local" && ! -L "$target/.env.production.local" ]] || die "release environment must be a regular file"
  verify_release_tree "$sha" "$target"
  report_env "$target/.env.production.local"
}

ready_marker_path() { printf '%s/.jianlian-shop-%s.ready\n' "$RELEASE_ROOT" "$1"; }
prepare_marker_path() { printf '%s/.jianlian-shop-%s.prepared\n' "$RELEASE_ROOT" "$1"; }
retry_marker_path() { printf '%s/.jianlian-shop-%s.build-retry\n' "$RELEASE_ROOT" "$1"; }
build_marker_path() { printf '%s/.jianlian-shop-%s.built\n' "$RELEASE_ROOT" "$1"; }

write_prepare_marker() {
  local sha="$1" target="$2" marker env_digest
  marker="$(prepare_marker_path "$sha")"
  env_digest="$(sha256sum "$target/.env.production.local" | awk '{print $1}')"
  printf 'SHA=%s\nENV_SHA256=%s\n' "$sha" "$env_digest" >"$marker"
  chmod 600 "$marker"
}

verify_prepare_marker() {
  local sha="$1" target="$2" marker expected_env
  marker="$(prepare_marker_path "$sha")"
  [[ -f "$marker" && ! -L "$marker" ]] || die "target was not prepared by this release workflow"
  [[ "$(stat -c '%a' "$marker")" == 600 ]] || die "prepare marker permissions must be 600"
  expected_env="$(sha256sum "$target/.env.production.local" | awk '{print $1}')"
  grep -Fxq "SHA=$sha" "$marker" || die "prepare marker SHA mismatch"
  grep -Fxq "ENV_SHA256=$expected_env" "$marker" || die "release environment changed after prepare"
}

write_build_marker() {
  local sha="$1" target="$2" marker build_digest
  marker="$(build_marker_path "$sha")"
  [[ -f "$target/.next/BUILD_ID" ]] || die "successful build did not create a BUILD_ID"
  build_digest="$(sha256sum "$target/.next/BUILD_ID" | awk '{print $1}')"
  printf 'SHA=%s\nBUILD_ID_SHA256=%s\n' "$sha" "$build_digest" >"$marker"
  chmod 600 "$marker"
}

verify_build_marker() {
  local sha="$1" target="$2" marker expected_build
  marker="$(build_marker_path "$sha")"
  [[ -f "$marker" && ! -L "$marker" ]] || die "target has no successful controlled-build marker"
  [[ "$(stat -c '%a' "$marker")" == 600 ]] || die "build marker permissions must be 600"
  expected_build="$(sha256sum "$target/.next/BUILD_ID" | awk '{print $1}')"
  grep -Fxq "SHA=$sha" "$marker" || die "build marker SHA mismatch"
  grep -Fxq "BUILD_ID_SHA256=$expected_build" "$marker" || die "build output changed after controlled build"
}

write_ready_marker() {
  local sha="$1" target="$2" marker env_digest build_digest
  marker="$(ready_marker_path "$sha")"
  env_digest="$(sha256sum "$target/.env.production.local" | awk '{print $1}')"
  build_digest="$(sha256sum "$target/.next/BUILD_ID" | awk '{print $1}')"
  printf 'SHA=%s\nENV_SHA256=%s\nBUILD_ID_SHA256=%s\n' "$sha" "$env_digest" "$build_digest" >"$marker"
  chmod 600 "$marker"
}

verify_ready_marker() {
  local sha="$1" target="$2" marker expected_env expected_build
  marker="$(ready_marker_path "$sha")"
  [[ -f "$marker" && ! -L "$marker" ]] || die "target has no successful smoke marker"
  [[ "$(stat -c '%a' "$marker")" == 600 ]] || die "smoke marker permissions must be 600"
  grep -Fxq "SHA=$sha" "$marker" || die "smoke marker SHA mismatch"
  expected_env="$(sha256sum "$target/.env.production.local" | awk '{print $1}')"
  expected_build="$(sha256sum "$target/.next/BUILD_ID" | awk '{print $1}')"
  grep -Fxq "ENV_SHA256=$expected_env" "$marker" || die "release environment changed after smoke"
  grep -Fxq "BUILD_ID_SHA256=$expected_build" "$marker" || die "release build identity changed after smoke"
}

disk_preflight() {
  local free_kb free_inodes
  free_kb="$(df -Pk "$RELEASE_ROOT" | awk 'NR==2 {print $4}')"
  free_inodes="$(df -Pi "$RELEASE_ROOT" | awk 'NR==2 {print $4}')"
  status WWW_FREE_KB "$free_kb"
  status WWW_FREE_INODES "$free_inodes"
  (( free_kb >= MIN_FREE_KB )) || die "insufficient disk space; cleanup must complete before npm ci/build"
  (( free_inodes >= MIN_FREE_INODES )) || die "insufficient inodes; cleanup must complete before npm ci/build"
}

preflight() {
  local sha="$1" rollback="$2" target current
  target="$(release_path_for_sha "$sha")"
  assert_release_path "$target"
  assert_release_path "$rollback"
  current="$(current_pm2_cwd)"
  assert_release_path "$current"
  status CURRENT_PM2_CWD "$current"
  status TARGET_COMMIT "$sha"
  [[ ! -e "$target" ]] || die "target release already exists"
  [[ -d "$rollback" ]] || die "designated rollback release does not exist"
  [[ "$rollback" != "$current" ]] || die "designated rollback release must differ from current Production"
  verify_runtime_release "$rollback"
  disk_preflight
  preflight_env
}

run_smoke() {
  local sha="$1" target pid='' path http
  target="$(release_path_for_sha "$sha")"
  assert_release_path "$target"
  [[ -d "$target/.next" ]] || die "target build output is missing"
  verify_release_tree "$sha" "$target"
  report_env "$target/.env.production.local"
  verify_prepare_marker "$sha" "$target"
  verify_build_marker "$sha" "$target"
  if ss -H -ltn "sport = :$SMOKE_PORT" | grep -q LISTEN; then
    die "smoke port $SMOKE_PORT is already in use"
  fi
  cleanup_smoke() { [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; }
  trap cleanup_smoke EXIT
  trap 'cleanup_smoke; exit 130' INT
  trap 'cleanup_smoke; exit 143' TERM
  (cd "$target" && exec ./node_modules/.bin/next start -p "$SMOKE_PORT" >"$RELEASE_ROOT/.jianlian-smoke-$sha.log" 2>&1) &
  pid=$!
  for _ in $(seq 1 30); do
    kill -0 "$pid" 2>/dev/null || die "smoke process exited before health checks"
    http="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$SMOKE_PORT/api/health" || true)"
    [[ "$http" == 200 ]] && break
    sleep 1
  done
  for path in /api/health / /login; do
    http="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$SMOKE_PORT$path" || true)"
    status "SMOKE_${path//\//_}" "$http"
    [[ "$http" == 200 ]] || die "smoke endpoint failed: $path"
  done
  cleanup_smoke
  pid=''
  trap - EXIT INT TERM
  write_ready_marker "$sha" "$target"
  status SMOKE_ASSESSMENT PASS
}

restore_previous_release() {
  local previous="$1" cwd path http
  JIANLIAN_RELEASE_DIR="$previous" pm2 startOrReload "$REPO/ecosystem.production.config.cjs" --only "$APP_NAME" --update-env || return 1
  cwd="$(current_pm2_cwd)" || return 1
  [[ "$cwd" == "$previous" ]] || return 1
  http="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PRODUCTION_PORT/api/health" || true)"
  [[ "$http" == 200 ]] || return 1
  for path in / /login; do
    http="$(curl -sS -o /dev/null -w '%{http_code}' "https://jianlian.shop$path" || true)"
    [[ "$http" == 200 ]] || return 1
  done
}

prepare() {
  local sha="$1" rollback="$2" target build_log retry_marker
  preflight "$sha" "$rollback"
  ensure_env_source
  target="$(release_path_for_sha "$sha")"
  git -C "$REPO" worktree add --detach "$target" "$sha"
  install -m 600 -- "$ENV_SOURCE" "$target/.env.production.local"
  (cd "$target" && npm ci)
  write_prepare_marker "$sha" "$target"
  build_log="$RELEASE_ROOT/.jianlian-build-$sha.log"
  if ! (cd "$target" && npm run build) > >(tee "$build_log") 2>&1; then
    if grep -Eqi 'next/font/google|fonts\.googleapis\.com' "$build_log" && grep -Eqi 'ETIMEDOUT|timeout' "$build_log"; then
      retry_marker="$(retry_marker_path "$sha")"
      printf 'RETRY_ALLOWED\n' >"$retry_marker"
      chmod 600 "$retry_marker"
      printf 'BUILD_RETRY_ALLOWED=ONE_MANUAL_RETRY\n' >&2
      printf 'After network review, run production-release.sh retry-build %s exactly once.\n' "$sha" >&2
    fi
    die "build failed; PM2 was not changed"
  fi
  write_build_marker "$sha" "$target"
  run_smoke "$sha"
}

retry_build() {
  local sha="$1" target marker build_log
  target="$(release_path_for_sha "$sha")"
  marker="$(retry_marker_path "$sha")"
  assert_release_path "$target"
  verify_release_tree "$sha" "$target"
  report_env "$target/.env.production.local"
  verify_prepare_marker "$sha" "$target"
  [[ -f "$marker" && ! -L "$marker" && "$(cat "$marker")" == RETRY_ALLOWED ]] || die "the single manual build retry is not authorized"
  printf 'RETRY_CONSUMED\n' >"$marker"
  chmod 600 "$marker"
  build_log="$RELEASE_ROOT/.jianlian-build-retry-$sha.log"
  if ! (cd "$target" && npm run build) > >(tee "$build_log") 2>&1; then
    die "the single manual build retry failed; no further retry is allowed and PM2 was not changed"
  fi
  write_build_marker "$sha" "$target"
  run_smoke "$sha"
}

switch_release() {
  local sha="$1" target current cwd path http
  target="$(release_path_for_sha "$sha")"
  assert_release_path "$target"
  verify_runtime_release "$target"
  verify_ready_marker "$sha" "$target"
  assert_release_env_matches_source "$target/.env.production.local"
  current="$(current_pm2_cwd)"
  verify_runtime_release "$current"
  status PREVIOUS_PRODUCTION_RELEASE "$current"
  if ! JIANLIAN_RELEASE_DIR="$target" pm2 startOrReload "$REPO/ecosystem.production.config.cjs" --only "$APP_NAME" --update-env; then
    restore_previous_release "$current" || die "target switch failed and previous release could not be verified; manual recovery required"
    die "target switch failed; previous release restored and pm2 save was not run"
  fi
  cwd="$(current_pm2_cwd)"
  if [[ "$cwd" != "$target" ]]; then
    restore_previous_release "$current" || die "target cwd mismatch and previous release could not be verified; manual recovery required"
    die "PM2 cwd did not match target; previous release restored and pm2 save was not run"
  fi
  for path in /api/health; do
    http="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PRODUCTION_PORT$path" || true)"
    if [[ "$http" != 200 ]]; then
      restore_previous_release "$current" || die "target health failed and previous release could not be verified; manual recovery required"
      die "local Production health failed; previous release restored and pm2 save was not run"
    fi
  done
  for path in / /login; do
    http="$(curl -sS -o /dev/null -w '%{http_code}' "https://jianlian.shop$path" || true)"
    if [[ "$http" != 200 ]]; then
      restore_previous_release "$current" || die "public validation failed and previous release could not be verified; manual recovery required"
      die "public Production endpoint failed: $path; previous release restored and pm2 save was not run"
    fi
  done
  pm2 save
  status PRODUCTION_SWITCH PASS
}

rollback_release() {
  local target="$1" sha current cwd path http
  assert_release_path "$target"
  current="$(current_pm2_cwd)"
  assert_release_path "$current"
  [[ "$target" != "$current" ]] || die "rollback target is already the current Production release"
  verify_runtime_release "$target"
  verify_runtime_release "$current"
  sha="${target##*-}"
  if ! JIANLIAN_RELEASE_DIR="$target" pm2 startOrReload "$REPO/ecosystem.production.config.cjs" --only "$APP_NAME" --update-env; then
    restore_previous_release "$current" || die "rollback switch failed and previous release could not be verified; manual recovery required"
    die "rollback switch failed; previous release restored and pm2 save was not run"
  fi
  cwd="$(current_pm2_cwd)"
  if [[ "$cwd" != "$target" ]]; then
    restore_previous_release "$current" || die "rollback cwd mismatch and previous release could not be verified; manual recovery required"
    die "rollback PM2 cwd mismatch; previous release restored and pm2 save was not run"
  fi
  for path in /api/health; do
    http="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PRODUCTION_PORT$path" || true)"
    if [[ "$http" != 200 ]]; then
      restore_previous_release "$current" || die "rollback health failed and previous release could not be verified; manual recovery required"
      die "rollback local health failed; previous release restored and pm2 save was not run"
    fi
  done
  for path in / /login; do
    http="$(curl -sS -o /dev/null -w '%{http_code}' "https://jianlian.shop$path" || true)"
    if [[ "$http" != 200 ]]; then
      restore_previous_release "$current" || die "rollback public validation failed and previous release could not be verified; manual recovery required"
      die "rollback public endpoint failed: $path; previous release restored and pm2 save was not run"
    fi
  done
  pm2 save
  status ROLLBACK_ASSESSMENT PASS
}

cleanup_releases() {
  local sha="$1" rollback="$2" confirm="${3:-}" target current dir registered=0 plan expected_plan
  local -a candidates=()
  target="$(release_path_for_sha "$sha")"
  assert_release_path "$target"; assert_release_path "$rollback"
  current="$(current_pm2_cwd)"; assert_release_path "$current"
  while IFS= read -r dir; do
    [[ -n "$dir" ]] || continue
    assert_release_path "$dir"
    [[ "$dir" == "$current" || "$dir" == "$target" || "$dir" == "$rollback" ]] && continue
    candidates+=("$dir")
    printf 'CLEANUP_CANDIDATE=%s\n' "$dir"
  done < <(find "$RELEASE_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'jianlian-shop-*' -printf '%p\n' | sort)
  plan="$RELEASE_ROOT/.jianlian-cleanup-$sha.plan"
  expected_plan="$(printf 'CURRENT=%s\nTARGET=%s\nROLLBACK=%s\n' "$current" "$target" "$rollback"; printf 'CANDIDATE=%s\n' "${candidates[@]}")"
  if [[ "$confirm" != --confirm ]]; then
    printf '%s\n' "$expected_plan" >"$plan"
    chmod 600 "$plan"
    die "cleanup candidates were listed and recorded only; review them before rerunning with --confirm"
  fi
  [[ -f "$plan" && ! -L "$plan" && "$(stat -c '%a' "$plan")" == 600 ]] || die "a separate cleanup dry-run plan is required before --confirm"
  printf '%s\n' "$expected_plan" | cmp -s - "$plan" || die "cleanup state changed since dry-run; run a new dry-run and review again"
  for dir in "${candidates[@]}"; do
    current="$(current_pm2_cwd)"
    assert_release_path "$current"
    assert_release_path "$target"
    assert_release_path "$rollback"
    assert_release_path "$dir"
    [[ "$dir" != "$current" && "$dir" != "$target" && "$dir" != "$rollback" ]] || die "cleanup protection changed after dry-run; refusing removal: $dir"
    registered=0
    while IFS= read -r wt; do [[ "$wt" == "$dir" ]] && registered=1; done < <(git -C "$REPO" worktree list --porcelain | awk '/^worktree / {sub(/^worktree /, ""); print}')
    [[ "$registered" == 1 ]] || die "candidate is not a registered worktree; refusing filesystem deletion: $dir"
    git -C "$REPO" worktree remove --force "$dir"
  done
  git -C "$REPO" worktree prune
  rm -f -- "$plan"
  status CLEANUP_ASSESSMENT PASS
}

require_tools
[[ -d "$REPO/.git" ]] || die "persistent repository is missing"
mkdir -p "$RELEASE_ROOT"
command="${1:-}"; shift || true
case "$command" in
  preflight) sha="$(full_sha "${1:-}")"; preflight "$sha" "${2:-}" ;;
  prepare) sha="$(full_sha "${1:-}")"; prepare "$sha" "${2:-}" ;;
  retry-build) sha="$(full_sha "${1:-}")"; retry_build "$sha" ;;
  smoke) sha="$(full_sha "${1:-}")"; run_smoke "$sha" ;;
  switch) sha="$(full_sha "${1:-}")"; switch_release "$sha" ;;
  rollback) rollback_release "${1:-}" ;;
  cleanup) sha="$(full_sha "${1:-}")"; cleanup_releases "$sha" "${2:-}" "${3:-}" ;;
  *) usage; exit 2 ;;
esac
