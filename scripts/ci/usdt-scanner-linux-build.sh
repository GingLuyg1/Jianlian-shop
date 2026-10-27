#!/usr/bin/env bash
# Build-only GitHub runner. No deployment, database, SSH or financial commands.
set -euo pipefail
[[ ${GITHUB_ACTIONS:-} == true && $(uname -s) == Linux && $(uname -m) == x86_64 ]]
kind=${ARTIFACT_KIND:?}; case "$kind" in candidate|rollback);; *) exit 64;; esac
head=$(git rev-parse HEAD)
[[ $head == "${APPROVED_HEAD:?}" && $head =~ ^[0-9a-f]{40}$ ]]
base=4575d802d653e4dca726427bce826aa68c93d9e2
rollback=d9a44fadaecc07bcb4e67e1f1b8e4271caac8bd7
git merge-base --is-ancestor "$base" "$head"
git merge-base --is-ancestor "$rollback" "$head"
source_sha=$head; [[ $kind != rollback ]] || source_sha=$rollback
work="${RUNNER_TEMP:?}/usdt-scanner-$kind"
[[ ! -e $work ]]; mkdir -m 700 "$work"; mkdir "$work/source" "$work/home" "$work/out"
git archive "$source_sha" -- . ':(exclude).env*' ':(exclude)**/.env*' ':(exclude).github' | tar -xf - -C "$work/source"
if find "$work/source" -type f -name '.env*' -print -quit | grep -q .; then exit 65; fi
if find "$work/source" -type l -print -quit | grep -q .; then exit 66; fi
git diff --name-only "$base" "$source_sha" >"$work/out/source-diff.txt"
if [[ $kind == rollback ]]; then
  [[ $(cat "$work/out/source-diff.txt") == lib/recharges/bep20-recharge-scanner.ts ]]
else
  unexpected=$(grep -Ev '^(lib/recharges/bep20-(recharge-scanner|order-scan-planner|scanner-rpc)\.ts|ops/recharge-order-scan-v1\.sql|tests/integration/recharge-order-driven-pg17\.mjs|tests/unit/bep20-(order-scan-planner|scanner-blockmachine-auth)\.test\.mjs|\.gitattributes|\.github/workflows/usdt-scanner-linux-artifacts\.yml|scripts/ci/usdt-scanner-[A-Za-z0-9.-]+)$' "$work/out/source-diff.txt" || true)
  [[ -z $unexpected ]]
fi
printf '%s\n' "$source_sha" >"$work/out/source-sha.txt"
echo BUILD_STAGE=PINNED_PUBLIC_CONFIGURATION_ONLY
node --test scripts/ci/usdt-scanner-public-config.test.mjs >"$work/out/public-config-tests.log" 2>&1
# Public login/static GETs only. No Supabase, SSH, CI secrets or privileged key.
node scripts/ci/usdt-scanner-public-config.mjs --fetch "$work" >"$work/out/public-config-fetch.log" 2>&1
image="jianlian-scanner-build:$head"
echo BUILD_STAGE=PINNED_ROCKY_IMAGE
docker build --pull=false -f scripts/ci/usdt-scanner-builder.Dockerfile -t "$image" scripts/ci >"$work/out/image-build.log" 2>&1
docker image inspect "$image" --format '{{.Id}}' >"$work/out/builder-image-id.txt"
common=(--rm --read-only --cap-drop=ALL --security-opt=no-new-privileges --pids-limit=512 --cpus=2 --memory=8g --user "$(id -u):$(id -g)" --tmpfs /tmp:rw,nosuid,size=512m -v "$work:/work" -v "$PWD/scripts/ci:/checks:ro" -e HOME=/work/home -e LANG=C.UTF-8)
echo BUILD_STAGE=LOCKED_PUBLIC_DEPENDENCIES
docker run "${common[@]}" "$image" env -i PATH=/opt/node/bin:/usr/bin:/bin HOME=/work/home LANG=C.UTF-8 npm_config_registry=https://registry.npmjs.org npm_config_cache=/work/home/npm-cache npm_config_userconfig=/work/home/user.npmrc npm_config_globalconfig=/work/home/global.npmrc npm ci --ignore-scripts --no-audit --no-fund >"$work/out/install.log" 2>&1
echo BUILD_STAGE=REAL_PUBLIC_INTER_FONT_CACHE
docker run "${common[@]}" "$image" node /checks/usdt-scanner-font-cache.mjs >"$work/out/font-cache.log" 2>&1
# No default route, host network, published ports, credentials or external APIs.
echo BUILD_STAGE=OFFLINE_BUILD_AND_RUNTIME_SMOKE
docker run "${common[@]}" --network none --add-host build-only.invalid:127.0.0.1 \
  -e ARTIFACT_KIND="$kind" -e SOURCE_SHA="$source_sha" -e CONTROL_SHA="$head" \
  -e ACTIONS_RUN_ID="$GITHUB_RUN_ID" -e ACTIONS_RUN_ATTEMPT="$GITHUB_RUN_ATTEMPT" \
  "$image" bash /checks/usdt-scanner-container-build.sh >"$work/out/offline-build-smoke.log" 2>&1
archive="$work/out/usdt-scanner-$kind-$source_sha-linux-x64.tar.gz"
tar -czf "$archive" -C "$work/source" --exclude='./.git' --exclude='./.github' --exclude='.env' --exclude='.env.*' --exclude='.npmrc' --exclude='./.next/cache' --exclude='./scripts/ci' --exclude='./tests' .
[[ $(stat -c %s "$archive") -lt 536870912 ]]
sha256sum "$archive" >"$work/out/SHA256SUMS"
printf 'ARTIFACT=%s\nSOURCE_SHA=%s\nPRODUCTION_BASE=%s\nPRODUCTION_CHANGED=no\nDEPLOYED=no\n' "$(basename "$archive")" "$source_sha" "$base" >"$work/out/receipt.ini"
echo "BUILD_AND_SMOKE_PASS=$kind"
