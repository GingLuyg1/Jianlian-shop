#!/usr/bin/env bash
# Production candidate preflight only. No server mutation is enabled in this draft.
# The final Nginx site path, guarded config hash and environment injection must be
# approved and rehearsed before any cutover/rollback implementation is activated.
set -Eeuo pipefail
umask 077

die() { printf 'BLOCKED: %s\n' "$*" >&2; exit 1; }
stage="${1:-}"
case "$stage" in prepare|validate|cutover|rollback) ;; *) die 'stage must be prepare, validate, cutover or rollback' ;; esac
[[ "$(uname -s)" == Linux ]] || die 'Linux required'
release_sha="${JIANLIAN_RELEASE_SHA:-}"
[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] || die 'full release SHA required'
release="/www/releases/jianlian-shop-$release_sha"
archive="${JIANLIAN_ARCHIVE:-}"
expected_sha="${JIANLIAN_ARCHIVE_SHA256:-}"
[[ -n "$archive" && "$expected_sha" =~ ^[0-9a-f]{64}$ ]] || die 'archive path and exact checksum required'
[[ -f "$archive" && ! -L "$archive" ]] || die 'archive missing or symlinked'
[[ "$(sha256sum "$archive" | awk '{print $1}')" == "$expected_sha" ]] || die 'archive checksum mismatch'
[[ -x /root/.nvm/versions/node/v20.20.2/bin/node ]] || die 'pinned Node binary unavailable'

case "$stage" in
  prepare)
    [[ ! -e "$release" ]] || die 'release path already exists; do not overwrite'
    [[ "$(df -PB1 /www | awk 'NR==2 {print $4}')" -ge 6442450944 ]] || die 'free space below 6 GiB'
    if ss -ltn '( sport = :3002 )' | awk 'NR>1 {found=1} END {exit !found}'; then
      die 'candidate port 3002 already in use'
    fi
    tar -tzf "$archive" | awk '/(^\/|(^|\/)\.\.\/)/ {bad=1} END {exit bad ? 0 : 1}' && die 'unsafe archive path'
    printf 'PREPARE_PREFLIGHT=PASS_READ_ONLY\nRELEASE_TARGET=%s\n' "$release"
    printf 'NEXT_ACTION=SEPARATELY_APPROVE_UPLOAD_EXTRACT_AND_ENV_INJECTION\n'
    ;;
  validate)
    [[ -f "$release/server.js" && -d "$release/.next/static" && -d "$release/public" ]] || die 'standalone release incomplete'
    curl -fsS --max-time 5 http://127.0.0.1:3002/api/health >/dev/null || die 'candidate health failed'
    curl -fsS --max-time 5 http://127.0.0.1:3002/login >/dev/null || die 'candidate login failed'
    printf 'VALIDATE_PREFLIGHT=PASS_READ_ONLY;DATABASE_READINESS_AND_STATIC_ASSETS_STILL_REQUIRE_APPROVED_CHECK\n'
    ;;
  cutover|rollback)
    die "$stage is intentionally disabled: exact Nginx site path/hash, old process restore and approved mutation plan are not yet validated"
    ;;
esac
