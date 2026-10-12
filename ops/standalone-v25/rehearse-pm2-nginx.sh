#!/usr/bin/env bash
# CI only: two copies of the pinned rehearsal bundle, isolated PM2 and Nginx.
set -Eeuo pipefail
umask 077

die() { printf 'BLOCKED: %s\n' "$*" >&2; exit 1; }
[[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]] || die 'Linux x86_64 required'
for tool in pm2 nginx curl tar sha256sum node awk; do command -v "$tool" >/dev/null || die "missing $tool"; done
archive="${1:?archive path required}"
expected="${2:?expected SHA-256 required}"
[[ "$expected" =~ ^[0-9a-f]{64}$ && -f "$archive" ]] || die 'invalid archive or digest'
actual="$(sha256sum "$archive" | awk '{print $1}')"
[[ "$actual" == "$expected" ]] || die 'pinned package checksum mismatch'
[[ -n "${RUNNER_TEMP:-}" ]] || die 'isolated CI RUNNER_TEMP required'
work="$(mktemp -d "$RUNNER_TEMP/v25-pm2-nginx.XXXXXX")"
export PM2_HOME="$work/pm2"
mkdir -p "$work/old" "$work/new" "$work/nginx/log" "$PM2_HOME"
cleanup() {
  pm2 delete v25-rehearsal-old v25-rehearsal-new >/dev/null 2>&1 || true
  pm2 kill >/dev/null 2>&1 || true
  nginx -p "$work/nginx/" -c "$work/nginx/nginx.conf" -s quit >/dev/null 2>&1 || true
  rm -rf -- "$work"
}
trap cleanup EXIT

tar -tzf "$archive" | awk '/(^\/|(^|\/)\.\.\/)/ {bad=1} END {exit bad ? 0 : 1}' && die 'unsafe archive paths'
tar -C "$work/old" -xzf "$archive"
tar -C "$work/new" -xzf "$archive"
old="$(find "$work/old" -mindepth 1 -maxdepth 1 -type d -name 'jianlian-shop-*' -print -quit)"
new="$(find "$work/new" -mindepth 1 -maxdepth 1 -type d -name 'jianlian-shop-*' -print -quit)"
[[ -n "$old" && -n "$new" && -f "$old/server.js" && -f "$new/server.js" ]] || die 'bundle structure missing'
[[ -d "$new/.next/static" && -d "$new/public" ]] || die 'static/public missing'
asset="$(find "$new/.next/static" -type f \( -name '*.css' -o -name '*.js' \) -print -quit)"
[[ -n "$asset" ]] || die 'static asset missing'
asset_path="/_next/static/${asset#"$new/.next/static/"}"

# These are intentionally the same rehearsal build. This validates PM2/Nginx
# mechanics, not the real Production old-release binary or cross-build assets.
cat > "$work/ecosystem.cjs" <<EOF
module.exports = { apps: [
 { name: 'v25-rehearsal-old', script: 'server.js', cwd: '$old', interpreter: process.execPath,
   instances: 1, exec_mode: 'fork', env: { NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: '3001' } },
 { name: 'v25-rehearsal-new', script: 'server.js', cwd: '$new', interpreter: process.execPath,
   instances: 1, exec_mode: 'fork', env: { NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: '3002' } }
] };
EOF
pm2 start "$work/ecosystem.cjs" >/dev/null
ready() {
  local port="$1" attempt
  for attempt in $(seq 1 40); do
    if curl -fsS --max-time 2 "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}
ready 3001 || die 'old slot health failed'
ready 3002 || die 'new slot health failed'
curl -fsS --max-time 5 "http://127.0.0.1:3002$asset_path" >/dev/null || die 'new static asset failed'

write_proxy() {
  local port="$1" slot="$2"
  [[ "$port" == 3001 || "$port" == 3002 ]] || die 'invalid port'
  cat > "$work/nginx/nginx.conf.next" <<EOF
pid $work/nginx/nginx.pid;
error_log $work/nginx/log/error.log warn;
events { worker_connections 128; }
http {
  access_log off;
  server {
    listen 127.0.0.1:3090;
    location / {
      proxy_pass http://127.0.0.1:$port;
      proxy_set_header Host \$host;
      add_header X-Rehearsal-Slot $slot always;
    }
  }
}
EOF
  mv -f "$work/nginx/nginx.conf.next" "$work/nginx/nginx.conf"
  nginx -p "$work/nginx/" -c "$work/nginx/nginx.conf" -t >/dev/null 2>&1 || die 'nginx -t failed'
}
assert_proxy() {
  local expected_slot="$1" headers
  headers="$(curl -fsS -D - -o /dev/null --max-time 5 http://127.0.0.1:3090/api/health)" || return 1
  grep -qi "^X-Rehearsal-Slot: $expected_slot" <<< "$headers" || return 1
  curl -fsS --max-time 5 http://127.0.0.1:3090/login >/dev/null || return 1
  curl -fsS --max-time 5 "http://127.0.0.1:3090$asset_path" >/dev/null || return 1
}
wait_proxy() {
  local slot="$1" attempt
  for attempt in $(seq 1 20); do
    if assert_proxy "$slot"; then return 0; fi
    sleep 0.2
  done
  return 1
}
write_proxy 3001 old
nginx -p "$work/nginx/" -c "$work/nginx/nginx.conf" >/dev/null 2>&1
wait_proxy old || die 'old proxy HTTP/static failed'

# Record real HTTP failures; measured in this CI run, never assumed zero.
probe() {
  local out="$1" i code
  for i in $(seq 1 80); do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 1 http://127.0.0.1:3090/api/health || true)"
    printf '%s %s\n' "$(date +%s%3N)" "$code" >> "$out"
    sleep 0.05
  done
}
probe "$work/cutover.probes" & probe_pid=$!
sleep 0.25
write_proxy 3002 new
nginx -p "$work/nginx/" -c "$work/nginx/nginx.conf" -s reload >/dev/null 2>&1
wait "$probe_pid"
wait_proxy new || die 'new proxy HTTP/static failed'

# Controlled fault: new PM2 process fails after cutover; old remains alive.
probe "$work/rollback.probes" & probe_pid=$!
sleep 0.25
pm2 stop v25-rehearsal-new >/dev/null
sleep 0.25
write_proxy 3001 old
nginx -p "$work/nginx/" -c "$work/nginx/nginx.conf" -s reload >/dev/null 2>&1
wait "$probe_pid"
wait_proxy old || die 'rollback proxy HTTP/static failed'
ready 3001 || die 'old PM2 process unavailable after rollback'

measure() {
  awk '($2 != "200") {failed++; if (!start) start=$1; next}
       {passed++; if (start) {gap=$1-start; if (gap > max) max=gap; start=0}}
       END {if (start) {gap=$1-start; if (gap > max) max=gap}; printf "%d %d %d", passed+0, failed+0, max+0}' "$1"
}
read -r cut_pass cut_fail cut_gap < <(measure "$work/cutover.probes")
read -r rollback_pass rollback_fail rollback_gap < <(measure "$work/rollback.probes")
printf 'PM2_STANDALONE_STARTUP=PASS_CI_TWO_SLOTS\nNGINX_PROXY_SWITCH=PASS_CI_RELOAD\n'
printf 'OLD_VERSION_HEALTH=PASS_SAME_BUILD_REHEARSAL_ONLY\nNEW_VERSION_HEALTH=PASS_REHEARSAL_BUILD\n'
printf 'CUTOVER_SUCCESSFUL_REQUESTS=%s\nCUTOVER_FAILED_REQUESTS=%s\nCUTOVER_MAX_FAILURE_GAP_MS=%s\n' "$cut_pass" "$cut_fail" "$cut_gap"
printf 'ROLLBACK_SUCCESSFUL_REQUESTS=%s\nROLLBACK_FAILED_REQUESTS=%s\nROLLBACK_MAX_FAILURE_GAP_MS=%s\n' "$rollback_pass" "$rollback_fail" "$rollback_gap"
printf 'ROLLBACK_HTTP_PASS=YES_AFTER_INJECTED_PM2_FAILURE\n'
printf 'PRODUCTION_OLD_BINARY_AND_CROSS_BUILD_STATIC=UNVERIFIED\n'
