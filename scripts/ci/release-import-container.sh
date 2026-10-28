#!/usr/bin/env bash
set -euo pipefail
export HOME=/tmp CI=true APP_ENV=test NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
export PAYMENT_PROVIDER_MODE=disabled DISABLE_EXTERNAL_PROVIDERS=true RECHARGE_BEP20_SCANNER_MODE=order_driven
a=a8b6afbec7fe9ff815f4bf3783e204b3116c3942
b=a2d2612867dafe801ece97c106c3605fd6118cdc
main=636b4d3ff244c2b721814f43f89e97bec7c4a0f4
repo=/www/jianlian-shop
target=/www/releases/jianlian-shop-$a
rollback=/www/releases/jianlian-shop-$b
[[ $(node --version) == v20.20.2 ]]
[[ $(awk 'NR>1 && $2=="00000000" {n++} END {print n+0}' /proc/net/route) == 0 ]]
mkdir /www/releases
git -c safe.directory=/control clone --quiet --no-hardlinks --no-checkout /control "$repo"
git -C "$repo" checkout --quiet --detach "$CONTROL_SHA"
git -C "$repo" update-ref refs/remotes/origin/main "$main"
git -C "$repo" merge-base --is-ancestor "$main" "$a"
git -C "$repo" merge-base --is-ancestor "$main" "$b"
git -C "$repo" worktree add --quiet --detach "$rollback" "$b"
node - "$repo/.env.local" <<'NODE'
const fs=require('fs'),crypto=require('crypto');
const c=JSON.parse(fs.readFileSync('/candidate/public-config.json','utf8'));
const pins=JSON.parse(fs.readFileSync('/control/scripts/ci/usdt-scanner-public-config-pins.json','utf8'));
for(const key of Object.keys(pins.sha256))if(crypto.createHash('sha256').update(c[key]).digest('hex')!==pins.sha256[key])throw Error('PUBLIC_CONFIG_PIN_MISMATCH');
const env={...c,SUPABASE_SECRET_KEY:'offline-synthetic-server-key',DAJU_API_BASE_URL:'https://offline-daju.invalid',DAJU_API_KEY:'offline-synthetic-daju-key',CRON_SECRET:'synthetic-build-only-job-secret',RECHARGE_BEP20_SCAN_JOB_SECRET:'synthetic-build-only-job-secret',DISABLE_EXTERNAL_PROVIDERS:'true',PAYMENT_PROVIDER_MODE:'disabled',RECHARGE_BEP20_SCANNER_MODE:'order_driven'};
fs.writeFileSync(process.argv[2],Object.entries(env).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600,flag:'wx'});
NODE
install -m 600 "$repo/.env.local" "$rollback/.env.production.local"
bp="/rollback/out/usdt-scanner-rollback-$b-linux-x64.tar.gz"
ap="/candidate/out/usdt-scanner-candidate-$a-linux-x64.tar.gz"
bh=$(awk '{print $1}' /rollback/out/SHA256SUMS)
ah=$(awk '{print $1}' /candidate/out/SHA256SUMS)
bih=$(awk '{print $1}' /rollback/out/IDENTITY_SHA256SUMS)
aih=$(awk '{print $1}' /candidate/out/IDENTITY_SHA256SUMS)
python3 "$repo/scripts/release-artifact.py" extract --repo "$repo" --sha "$b" --required-main "$main" \
  --archive "$bp" --archive-sha256 "$bh" --identity /rollback/out/build-identity.json --identity-sha256 "$bih" --target "$rollback" > /evidence/rollback-extract.json
python3 "$repo/scripts/release-artifact.py" seal --sha "$b" --target "$rollback" --seal /evidence/rollback-runtime-seal.json > /evidence/rollback-seal.json
# This is the bootstrap of a disposable CI fixture, never a Production switch or a fabricated ready marker.
JIANLIAN_RELEASE_DIR="$rollback" PM2_HOME=/root/.pm2 pm2 start "$repo/ecosystem.production.config.cjs" --only jianlian-shop > /evidence/pm2-bootstrap.log 2>&1
cleanup(){ PM2_HOME=/root/.pm2 pm2 delete jianlian-shop >/dev/null 2>&1 || true; PM2_HOME=/root/.pm2 pm2 kill >/dev/null 2>&1 || true; }
trap cleanup EXIT
for attempt in $(seq 1 30); do
  http=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/api/health || true)
  [[ $http != 200 ]] || break
  sleep 1
done
[[ $http == 200 ]]
node <<'NODE'
const fs=require('fs'),cp=require('child_process');
const list=JSON.parse(cp.execFileSync('pm2',['jlist'],{env:{...process.env,PM2_HOME:'/root/.pm2'},encoding:'utf8'}));
const app=list.find(x=>x.name==='jianlian-shop');
const expected='/www/releases/jianlian-shop-a2d2612867dafe801ece97c106c3605fd6118cdc';
if(!app||app.pm2_env.status!=='online'||fs.readlinkSync('/proc/'+app.pid+'/cwd')!==expected||app.pm2_env.pm_cwd!==expected)throw Error('REAL_PM2_CWD_MISMATCH');
fs.writeFileSync('/evidence/real-pm2-baseline.json',JSON.stringify({pid:app.pid,sourceSHA:expected.slice(-40),cwdMatch:true,realPM2:true,production:false}));
NODE
# Invoke the authority itself: it must validate, extract, create its own markers and run actual port-3002 HTTP checks.
bash "$repo/scripts/production-release.sh" import-prebuilt "$a" "$rollback" "$ap" "$ah" /candidate/out/build-identity.json "$aih" "$main" > /evidence/authority-import.log 2>&1
[[ -f /www/releases/.jianlian-shop-$a.ready ]]
# Re-run only authority's verification functions, not a second application smoke or build.
source <(sed '/^require_tools$/,$d' "$repo/scripts/production-release.sh")
verify_runtime_release "$target" > /evidence/runtime-validation.log
verify_prepare_marker "$a" "$target"
verify_build_marker "$a" "$target"
verify_ready_marker "$a" "$target"
python3 "$repo/scripts/release-artifact.py" check-seal --sha "$b" --target "$rollback" --seal /evidence/rollback-runtime-seal.json > /evidence/rollback-post-start-seal.json
node <<'NODE'
const fs=require('fs');
(async()=>{
 const r=await fetch('http://127.0.0.1:3001/api/internal/recharges/bep20/scan',{headers:{'x-internal-job-secret':'synthetic-build-only-job-secret'},signal:AbortSignal.timeout(5000)});
 const b=await r.json();if(r.status!==503||b.code!=='RECHARGE_SCANNER_ROLLBACK_CONTAINED')throw Error('ROLLBACK_DID_NOT_FAIL_CLOSED');
 fs.writeFileSync('/evidence/final-acceptance.json',JSON.stringify({candidateSHA:'a8b6afbec7fe9ff815f4bf3783e204b3116c3942',rollbackSHA:'a2d2612867dafe801ece97c106c3605fd6118cdc',authorityImport:'PASS',port3002ActualHttp:'PASS',markersCreatedByAuthority:true,realPM2Cwd:'PASS',safeStop:'PASS',externalNetwork:'NONE',runtimeSecrets:'SYNTHETIC_ONLY',productionChanged:false,productionSql:false,realCredit:false},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1});
NODE
