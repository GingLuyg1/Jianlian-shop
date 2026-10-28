#!/usr/bin/env bash
set -euo pipefail
[[ ${GITHUB_ACTIONS:-} == true && $(git rev-parse HEAD) == "${APPROVED_HEAD:?}" ]]
root="${RUNNER_TEMP:?}"
evidence="$root/usdt-release-import-evidence"
mkdir -m 700 "$evidence"
image="jianlian-scanner-build:$APPROVED_HEAD"
docker run --rm --read-only --network none --cap-drop=ALL --security-opt=no-new-privileges \
  --pids-limit=512 --cpus=2 --memory=8g --tmpfs /tmp:rw,nosuid,size=512m \
  --tmpfs /www:rw,nosuid,nodev,exec,size=3g --tmpfs /root/.pm2:rw,nosuid,nodev,size=128m \
  -v "$PWD:/control:ro" -v "$root/usdt-scanner-candidate:/candidate:ro" \
  -v "$root/usdt-scanner-rollback:/rollback:ro" -v "$evidence:/evidence" \
  -e CONTROL_SHA="$APPROVED_HEAD" "$image" bash /control/scripts/ci/release-import-container.sh \
  >"$evidence/import-run.log" 2>&1
