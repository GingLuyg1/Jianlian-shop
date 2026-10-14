#!/usr/bin/env bash
# Only ephemeral GitHub Linux runners. Actual independent old/new artifacts.
set -Eeuo pipefail
umask 077
die() { printf 'BLOCKED=%s\n' "$*" >&2; exit 1; }
[[ "${GITHUB_ACTIONS:-}" == true && "${GITHUB_REPOSITORY:-}" == GingLuyg1/Jianlian-shop && "${GITHUB_REF:-}" == refs/heads/validation/next1641-linux-20261015 ]] || die 'wrong runner/ref'
[[ "$(uname -s)" == Linux && -n "${RUNNER_TEMP:-}" ]] || die 'isolated Linux required'
packages="$(realpath "${1:?packages required}")"
old_node="${2:?old Node required}"; new_node="${3:?new Node required}"
evidence="${4:?evidence directory required}"
[[ "$packages" == "$RUNNER_TEMP/"* && "$evidence" == "$RUNNER_TEMP/"* ]] || die 'all outputs must remain in runner temp'
[[ "$($old_node --version)" == v20.20.2 && "$($new_node --version)" == v24.21.0 ]] || die 'pinned runtime mismatch'
mkdir -p "$evidence"
work="$(mktemp -d "$RUNNER_TEMP/next-cross-version.XXXXXX")"
export PM2_HOME="$work/pm2"
mkdir -p "$work/releases" "$work/nginx/logs"
cleanup() {
  local result=$?
  set +e
  if [[ -d "$PM2_HOME/logs" ]]; then cp -a "$PM2_HOME/logs" "$evidence/pm2-logs"; fi
  if [[ -d "$work/nginx/logs" ]]; then cp -a "$work/nginx/logs" "$evidence/nginx-logs"; fi
  pm2 delete ci-legacy ci-rc-webpack ci-rc-turbopack >/dev/null 2>&1
  pm2 kill >/dev/null 2>&1
  if [[ -f "$work/nginx/nginx.pid" ]]; then nginx -p "$work/nginx/" -c "$work/nginx/nginx.conf" -s quit >/dev/null 2>&1; fi
  printf 'REHEARSAL_EXIT_CODE=%s\n' "$result"
}
trap cleanup EXIT
for label in legacy rc-webpack rc-turbopack; do
  (cd "$packages" && sha256sum -c "$label.tar.gz.sha256")
  if tar -tzf "$packages/$label.tar.gz" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then die 'unsafe archive path'; fi
  tar -C "$work/releases" -xzf "$packages/$label.tar.gz"
  cp "$packages/$label.manifest.json" "$evidence/"
done
export CI_REHEARSAL_ROOT="$work/releases"
"$new_node" - "$old_node" "$new_node" "$work/ecosystem.config.cjs" <<'NODE'
const fs=require('node:fs');const path=require('node:path');const cp=require('node:child_process');
const [oldNode,newNode,output]=process.argv.slice(2);
const definitions=[['legacy','13.5.1',oldNode,3301],['rc-webpack','16.4.1',newNode,3302],['rc-turbopack','16.4.1',newNode,3303]];
const apps=definitions.map(([label,version,interpreter,port])=>{
 const cwd=path.join(process.env.CI_REHEARSAL_ROOT,label);
 const manifest=JSON.parse(fs.readFileSync(path.join(cwd,'ci-build-manifest.json')));
 const installed=JSON.parse(fs.readFileSync(path.join(cwd,'node_modules/next/package.json'))).version;
 if(installed!==version||manifest.next!==version||manifest.react!=='18.2.0')throw Error('Not actual pinned independent version');
 const actual=cp.execFileSync(interpreter,['-p','require("./node_modules/next/package.json").version'],{cwd,encoding:'utf8'}).trim();
 if(actual!==version)throw Error('Interpreter cannot load installed version');
 console.log(`ACTUAL_ARTIFACT=${label} NEXT=${actual} NODE=${cp.execFileSync(interpreter,['-v'],{encoding:'utf8'}).trim()} SOURCE_SHA=${manifest.sourceCommit} BUILD_ID=${manifest.buildId}`);
 return {name:'ci-'+label,script:'server.js',cwd,interpreter,instances:1,exec_mode:'fork',autorestart:true,min_uptime:1000,max_restarts:5,env:{NODE_ENV:'production',HOSTNAME:'127.0.0.1',PORT:String(port),GITHUB_SHA:manifest.sourceCommit,VERCEL_GIT_COMMIT_SHA:manifest.sourceCommit,APP_ENV:'test',PAYMENT_PROVIDER_MODE:'disabled',DISABLE_EXTERNAL_PROVIDERS:'true'}};
});
if(new Set(apps.map(a=>fs.realpathSync(path.join(a.cwd,'node_modules')))).size!==3)throw Error('Shared dependencies forbidden');
fs.writeFileSync(output,'module.exports = '+JSON.stringify({apps},null,2)+';\n');
NODE
"$new_node" - "$(npm root -g)/pm2/lib/Common.js" "$work/ecosystem.config.cjs" <<'NODE'
const assert=require('node:assert/strict');
assert.equal(require(process.argv[2]).isConfigFile(process.argv[3]),'js','PM2 must recognize this as an ecosystem configuration, not an executable');
assert.equal(require(process.argv[3]).apps.length,3);
NODE
pm2 start "$work/ecosystem.config.cjs" >/dev/null
pm2 jlist | "$new_node" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const names=JSON.parse(s).map(p=>p.name);for(const n of ["ci-legacy","ci-rc-webpack","ci-rc-turbopack"])if(!names.includes(n))throw Error("Missing PM2 application "+n);console.log("PM2_ECOSYSTEM_APPS=THREE_PINNED_VERSIONS")})'
ready() {
  local port="$1"
  for attempt in $(seq 1 60); do
    if curl -fsS --max-time 2 "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; then return 0; fi
    sleep 0.5
  done
  return 1
}
for port in 3301 3302 3303; do ready "$port" || die "standalone port $port failed"; done
for label in legacy rc-webpack rc-turbopack; do
  case "$label" in legacy) port=3301;; rc-webpack) port=3302;; rc-turbopack) port=3303;; esac
  curl -fsS -D "$evidence/$label-direct.headers" "http://127.0.0.1:$port/api/health" > "$evidence/$label-direct.json"
done
pm2_pid() { pm2 pid "$1" | tail -n 1; }
before="$(pm2_pid ci-rc-webpack)"
pm2 restart ci-rc-webpack >/dev/null
ready 3302 || die 'new process did not recover after PM2 restart'
after="$(pm2_pid ci-rc-webpack)"
[[ "$before" =~ ^[0-9]+$ && "$after" =~ ^[0-9]+$ && "$before" != "$after" && "$after" != 0 ]] || die 'restart did not replace process'
printf 'PM2_RESTART=PASS;PID_CHANGED\n'
write_proxy() {
  local port="$1" slot="$2"
  [[ "$port" == 3301 || "$port" == 3302 ]] || die 'invalid upstream port'
  cat > "$work/nginx/nginx.conf" <<EOF
pid $work/nginx/nginx.pid;
error_log $work/nginx/logs/error.log warn;
events { worker_connections 128; }
http {
  access_log off;
  client_body_temp_path $work/nginx/client-temp;
  proxy_temp_path $work/nginx/proxy-temp;
  server {
    listen 127.0.0.1:3390;
    add_header X-CI-Slot $slot always;
    location / {
      limit_except GET HEAD { deny all; }
      proxy_pass http://127.0.0.1:$port;
      proxy_set_header Host \$http_host;
      proxy_set_header X-Forwarded-For \$remote_addr;
      proxy_set_header X-Forwarded-Proto http;
      proxy_set_header X-Request-Id \$http_x_request_id;
    }
  }
}
EOF
  nginx -p "$work/nginx/" -c "$work/nginx/nginx.conf" -t
}
verify_proxy() {
  local label="$1" expected_short asset path phase="$2"
  for attempt in $(seq 1 40); do
    if curl -fsS --max-time 3 -H 'X-Request-Id: ci-cross-version-001' -D "$evidence/$phase.headers" http://127.0.0.1:3390/api/health > "$evidence/$phase.json" && grep -qi "^X-CI-Slot: $label" "$evidence/$phase.headers"; then break; fi
    [[ "$attempt" != 40 ]] || return 1
    sleep 0.1
  done
  "$new_node" - "$work/releases/$label/ci-build-manifest.json" "$evidence/$phase.json" <<'NODE'
const fs=require('node:fs');const [m,h]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p)));
if(h.status!=='ok'||h.commit_sha!==m.sourceCommit.slice(0,12)||h.environment!=='test')throw Error('Health does not match real source commit and test environment');
NODE
  grep -qi '^Cache-Control:.*no-store' "$evidence/$phase.headers" || return 1
  grep -qi '^X-Content-Type-Options: nosniff' "$evidence/$phase.headers" || return 1
  grep -qi '^X-Request-Id: ci-cross-version-001' "$evidence/$phase.headers" || return 1
  curl -fsS --max-time 15 http://127.0.0.1:3390/login >/dev/null || return 1
  asset="$(find "$work/releases/$label/.next/static" -type f -name '*.css' -print -quit)"
  [[ -n "$asset" ]] || return 1
  path="/_next/static/${asset#"$work/releases/$label/.next/static/"}"
  curl -fsS --max-time 10 "http://127.0.0.1:3390$path" >/dev/null || return 1
}
probe() {
  local file="$1" code
  for i in $(seq 1 100); do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 1 http://127.0.0.1:3390/api/health || true)"
    printf '%s %s\n' "$(date +%s%3N)" "$code" >> "$file"
    sleep 0.04
  done
}
write_proxy 3301 legacy
nginx -p "$work/nginx/" -c "$work/nginx/nginx.conf"
verify_proxy legacy before-upgrade || die 'old version not working before cutover'
probe "$evidence/cutover.probes" & probe_pid=$!
write_proxy 3302 rc-webpack
nginx -p "$work/nginx/" -c "$work/nginx/nginx.conf" -s reload
verify_proxy rc-webpack after-upgrade || die 'real 16.4.1 cutover failed'
wait "$probe_pid"
# Inject a real process failure and require an observed proxy failure.
pm2 stop ci-rc-webpack >/dev/null
fault="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3390/api/health || true)"
printf 'INJECTED_NEW_FAILURE_HTTP=%s\n' "$fault"
[[ "$fault" == 502 ]] || die 'expected controlled unavailable-new-upstream response'
# Restart the old artifact itself, not just a proxy pointing to an old alive PID.
pm2 stop ci-legacy >/dev/null
pm2 start ci-legacy >/dev/null
ready 3301 || die 'old version cannot restart for rollback'
probe "$evidence/rollback.probes" & probe_pid=$!
write_proxy 3301 legacy
nginx -p "$work/nginx/" -c "$work/nginx/nginx.conf" -s reload
verify_proxy legacy after-rollback || die 'real old version restoration failed'
wait "$probe_pid"
# Recover the failed new process without routing user traffic back to it.
pm2 start ci-rc-webpack >/dev/null
ready 3302 || die 'failed new process cannot recover'
pm2 jlist | "$new_node" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,interpreter:p.pm2_env.exec_interpreter})),null,2)))' > "$evidence/pm2-safe-status.json"
for phase in cutover rollback; do
  awk -v phase="$phase" '{total++;if($2!="200")failed++}END{printf "%s_TOTAL=%d\n%s_FAILED_REQUESTS=%d\n",toupper(phase),total,toupper(phase),failed+0}' "$evidence/$phase.probes"
done
(cd "$packages" && sha256sum -c legacy.tar.gz.sha256 rc-webpack.tar.gz.sha256 rc-turbopack.tar.gz.sha256)
printf 'STANDALONE_HEALTH=PASS_13.5.1_AND_BOTH_16.4.1_BUILDERS\nPM2_REHEARSAL=PASS\nNGINX_REHEARSAL=PASS\nCROSS_VERSION_ROLLBACK=PASS_13.5.1_NODE20_TO_16.4.1_NODE24_TO_13.5.1_NODE20\n'
printf 'REAL_AUTH_AND_BUSINESS=NOT_TESTED_NO_LIVE_CREDENTIALS\nPRODUCTION_DEPLOYMENT=NO\n'
