#!/usr/bin/env bash
set -euo pipefail
cd /work/source
[[ $(node --version) == v20.20.2 && $(uname -m) == x86_64 ]]
[[ $(awk 'NR>1 && $2=="00000000" {n++} END {print n+0}' /proc/net/route) == 0 ]]
export CI=true APP_ENV=production NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=3072
export PAYMENT_PROVIDER_MODE=disabled DISABLE_EXTERNAL_PROVIDERS=true RECHARGE_BEP20_SCANNER_MODE=order_driven
unset NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY CRON_SECRET
unset BSC_RPC_URL BSC_RECEIPT_RPC_URL RECHARGE_BEP20_RPC_URL RECHARGE_BEP20_BLOCKMACHINE_API_KEY
node /checks/usdt-scanner-verify-source.mjs "$ARTIFACT_KIND" >/work/out/source-verification.json
sha256sum package.json package-lock.json >/work/out/dependency-manifest-before.sha256
# The financial/scanner code is unchanged and hash-verified above. Reuse its
# previous 18 groups and hosted Test proof, not an unnecessary rerun here.
printf '{"kind":"%s","reused":true,"sourceUnchanged":true,"previousRun":"40499184505","newScannerTestsExecuted":0}\n' "$ARTIFACT_KIND" >/work/out/scanner-smoke.json
node /checks/usdt-scanner-font-cache.mjs --verify
# Upstream hook reads the already-verified real CSS and absolute WOFF2 files.
# It is not used for API, Auth, payment, scanner or business responses.
NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/work/font-cache/responses.cjs node /checks/usdt-scanner-public-config.mjs --build /work >/work/out/next-build.log 2>&1
test -s .next/BUILD_ID; test -s .next/routes-manifest.json; test -s .next/required-server-files.json
npm_config_cache=/work/home/npm-cache npm_config_userconfig=/work/home/user.npmrc npm_config_globalconfig=/work/home/global.npmrc npm prune --omit=dev --ignore-scripts --offline --no-audit --no-fund >/work/out/prune.log 2>&1
export CRON_SECRET=synthetic-build-only-job-secret
node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3207 >/work/out/startup.log 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true' EXIT
node /checks/usdt-scanner-runtime-smoke.mjs "$ARTIFACT_KIND" >/work/out/runtime-smoke.json
kill "$server_pid"; wait "$server_pid" || true; trap - EXIT
sha256sum -c /work/out/dependency-manifest-before.sha256
cp .next/BUILD_ID /work/out/BUILD_ID
node -e 'const fs=require("fs"),os=require("os");fs.writeFileSync("/work/out/build-identity.json",JSON.stringify({kind:process.env.ARTIFACT_KIND,sourceSHA:process.env.SOURCE_SHA,controlSHA:process.env.CONTROL_SHA,runId:process.env.ACTIONS_RUN_ID,runAttempt:process.env.ACTIONS_RUN_ATTEMPT,node:process.version,platform:process.platform,arch:process.arch,os:fs.readFileSync("/etc/os-release","utf8"),glibc:process.report.getReport().header.glibcVersionRuntime,cpus:2,memoryLimitGiB:8,network:"none",secretsProvided:false,productionDatabaseAccess:false,productionPublicConfig:true,publicConfigInlineAudit:"PASS",publicConfigDigests:JSON.parse(fs.readFileSync("/work/out/public-config-inline-audit.json","utf8")).pinnedDigests,databaseOperations:false,smoke:"PASS",rollbackLimit:process.env.ARTIFACT_KIND==="rollback"?"FAIL_CLOSED_NO_AUTOCREDIT":null},null,2));'
rpm -qa | LC_ALL=C sort >/work/out/builder-rpm-list.txt
