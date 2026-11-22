import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = readFileSync(new URL("../../scripts/production-release.sh", import.meta.url), "utf8").replace(/\r\n/g, "\n");
// Only load declarations: never execute the production CLI entry point.
const definitions = script.split("\nrequire_tools\n")[0];
assert.notEqual(definitions, script);
const bash = process.env.JIANLIAN_TEST_BASH || (process.platform === "win32"
  ? ["D:/Apps/Git/bin/bash.exe", "C:/Program Files/Git/bin/bash.exe"].find(existsSync)
  : "bash");
assert.ok(bash, "Bash is required; release safety tests must not silently skip");
const run = (body) => spawnSync(bash, ["--noprofile", "--norc", "-s"], {
  input: `${definitions}\n${body}\n`, encoding: "utf8", timeout: 10000,
  env: { ...process.env, PM2_HOME: "/untrusted/inherited-daemon" },
});
const pass = (result) => assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

const mockPublicCurl = `
curl() {
  [[ "$1" == -q ]] || return 2
  local url='' format='' location
  for arg in "$@"; do
    [[ "$arg" != -L && "$arg" != --location ]] || return 2
    url="$arg"
  done
  while (( $# )); do
    if [[ "$1" == -w ]]; then format="$2"; break; fi
    shift
  done
  case "$url" in
    https://jianlian.shop/|https://jianlian.shop/login)
      [[ "$format" == '%{http_code}\\n%header{location}' ]] || return 2
      location="$BARE_LOCATION"
      if [[ "$location" == exact ]]; then location="https://www.\${url#https://}"; fi
      printf '%s\\n%s' "$BARE_CODE" "$location"
      ;;
    https://www.jianlian.shop/)
      [[ "$format" == '%{http_code}' ]] || return 2
      printf '%s' "$WWW_ROOT"
      ;;
    https://www.jianlian.shop/login)
      [[ "$format" == '%{http_code}' ]] || return 2
      printf '%s' "$WWW_LOGIN"
      ;;
    *) return 2 ;;
  esac
}
BARE_CODE=301
BARE_LOCATION=exact
WWW_ROOT=200
WWW_LOGIN=200
`;

for (const [name, override, accepted] of [
  ["301 to exact www path", "", true],
  ["308 to exact www path", "BARE_CODE=308", true],
  ["temporary 302", "BARE_CODE=302", false],
  ["temporary 307", "BARE_CODE=307", false],
  ["wrong host", "BARE_LOCATION=https://wrong.example/", false],
  ["wrong path", "BARE_LOCATION=https://www.jianlian.shop/login", false],
  ["wrong scheme", "BARE_LOCATION=http://www.jianlian.shop/", false],
  ["relative Location", "BARE_LOCATION=/", false],
  ["missing Location", "BARE_LOCATION=''", false],
  ["redirect loop", "BARE_LOCATION=https://jianlian.shop/", false],
  ["bare 404", "BARE_CODE=404", false],
  ["bare 500", "BARE_CODE=500", false],
  ["www root non-200", "WWW_ROOT=301", false],
  ["www login non-200", "WWW_LOGIN=503", false],
]) {
  test(`public release contract checks ${name}`, () => {
    const result = run(`${mockPublicCurl}\n${override}\nverify_public_endpoints`);
    assert.equal(result.status, accepted ? 0 : 1, result.stdout + result.stderr);
    if (accepted) {
      assert.match(result.stdout, /PUBLIC_BARE_REDIRECT__=PASS/);
      assert.match(result.stdout, /PUBLIC_BARE_REDIRECT__login=PASS/);
      assert.match(result.stdout, /PUBLIC_CANONICAL__login=200/);
    }
  });
}

test("localhost health remains a direct 200 gate", () => {
  const probe = `
seq() { printf '0\\n'; }
sleep() { :; }
curl() {
  for arg in "$@"; do :; done
  [[ "$arg" == http://127.0.0.1:3001/api/health ]] || return 2
  printf '%s' "$LOCAL_STATUS"
}
`;
  pass(run(`${probe}\nLOCAL_STATUS=200 wait_for_production_health`));
  assert.equal(run(`${probe}\nLOCAL_STATUS=301 wait_for_production_health`).status, 1);
});

// All files are disposable local fixtures, never actual release directories.
const fixture = `
fixture=$(mktemp -d)
trap 'rm -r -- "$fixture"' EXIT
RELEASE_ROOT="$fixture/releases"
REPO="$fixture/repo"
sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
old=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
current="$RELEASE_ROOT/jianlian-shop-$old"
fixtureLive="$current"
mkdir -p "$current/.next/server" "$current/node_modules/next/dist/bin"
printf 'fixture-build' > "$current/.next/BUILD_ID"
printf '{}' > "$current/.next/routes-manifest.json"
printf '{}' > "$current/.next/required-server-files.json"
printf '{}' > "$current/package.json"
printf 'fixture-runtime' > "$current/node_modules/next/dist/bin/next"
touch "$current/.env.production.local"
# Keep runtime artifact checks real; only external identity/env/daemon checks mocked.
assert_release_path() {
  [[ "$1" == "$RELEASE_ROOT"/jianlian-shop-* && "\${1##*-}" =~ ^[0-9a-f]{40}$ ]] || die 'not a fixture release path'
}
assert_existing_release_path() { assert_release_path "$1"; }
is_legacy_nested_release_path() { return 1; }
git() { return 0; }
verify_release_tree() { return 0; }
report_env() { return 0; }
disk_preflight() { return 0; }
preflight_env() { return 0; }
current_pm2_cwd() { printf '%s\\n' "$fixtureLive"; }
`;

test("current live is a valid preflight rollback with complete runtime artifacts", () => {
  const result = run(`${fixture}\npreflight "$sha" "$current"`);
  pass(result);
  assert.match(result.stdout, /PM2_HOME=\/root\/\.pm2/);
});

for (const [name, setup, rollback, reason] of [
  ["candidate as rollback", "", '"$(release_path_for_sha "$sha")"', /differ from candidate/],
  ["missing rollback", "", '"$RELEASE_ROOT/jianlian-shop-cccccccccccccccccccccccccccccccccccccccc"', /does not exist/],
  ["non-release rollback", "", '"$fixture/other"', /not a fixture release path/],
  ["missing build", 'rm "$current/.next/BUILD_ID"', '"$current"', /build output is incomplete/],
  ["missing runtime", 'rm "$current/node_modules/next/dist/bin/next"', '"$current"', /runtime artifacts/],
  ["missing server manifest", 'rm "$current/.next/required-server-files.json"', '"$current"', /server build artifacts/],
  ["empty build identity", ': > "$current/.next/BUILD_ID"', '"$current"', /runtime artifacts/],
]) {
  test(`preflight rejects ${name}`, () => {
    const result = run(`${fixture}\n${setup}\npreflight "$sha" ${rollback}`);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, reason);
  });
}

test("production release path validation rejects non-release and non-canonical paths", () => {
  pass(run('assert_release_path /www/releases/jianlian-shop-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'));
  assert.equal(run('assert_release_path /tmp/not-a-release').status, 1);
  assert.equal(run('assert_release_path /www/releases/../not-a-release').status, 1);
});

test("legacy nested release is accepted only as an existing runtime/recovery path", () => {
  const accepted = run(`
fixture=$(mktemp -d)
trap 'rm -r -- "$fixture"' EXIT
RELEASE_ROOT="$fixture/releases"
sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
nested="$RELEASE_ROOT/ui-round2-candidate-20261117/jianlian-shop-$sha"
mkdir -p "$nested"
assert_existing_release_path "$nested"
is_legacy_nested_release_path "$nested"
`);
  pass(accepted);

  const rejectedAsCandidate = run(`
fixture=$(mktemp -d)
trap 'rm -r -- "$fixture"' EXIT
RELEASE_ROOT="$fixture/releases"
sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
nested="$RELEASE_ROOT/ui-round2-candidate-20261117/jianlian-shop-$sha"
mkdir -p "$nested"
assert_release_path "$nested"
`);
  assert.equal(rejectedAsCandidate.status, 1);

  const tooDeep = run(`
fixture=$(mktemp -d)
trap 'rm -r -- "$fixture"' EXIT
RELEASE_ROOT="$fixture/releases"
sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
nested="$RELEASE_ROOT/legacy/extra/jianlian-shop-$sha"
mkdir -p "$nested"
assert_existing_release_path "$nested"
`);
  assert.equal(tooDeep.status, 1);
});

test("preflight accepts a verified one-level legacy current release as rollback", () => {
  const result = run(`
fixture=$(mktemp -d)
trap 'rm -r -- "$fixture"' EXIT
RELEASE_ROOT="$fixture/releases"
REPO="$fixture/repo"
sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
old=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
current="$RELEASE_ROOT/ui-round2-candidate-20261117/jianlian-shop-$old"
fixtureLive="$current"
mkdir -p "$REPO" "$current"
current_pm2_cwd() { printf '%s\\n' "$fixtureLive"; }
verify_runtime_release() { assert_existing_release_path "$1"; }
disk_preflight() { return 0; }
preflight_env() { return 0; }
preflight "$sha" "$current"
`);
  pass(result);
  assert.match(result.stdout, /CURRENT_PM2_CWD=.*ui-round2-candidate-20261117/);
});

test("all raw PM2 calls are confined to the pinned wrapper; protected path absent", () => {
  const withoutWrapper = script.replace('run_pm2() { PM2_HOME=/root/.pm2 pm2 "$@"; }', "");
  assert.doesNotMatch(withoutWrapper, /(?:^|[\s;()])pm2\s+(?:pid|describe|jlist|status|start|delete|save)\b/m);
  assert.doesNotMatch(script, /\/200(?:\/|\b)/);
  assert.match(script, /if ! run_pm2 save; then[\s\S]*status RECOVERY_PM2_SAVE FAIL[\s\S]*return 1/);
  assert.doesNotMatch(script, /pm2 save was not run/);
  const result = run(`pm2() { printf '%s:%s\\n' "$PM2_HOME" "$*"; }
for action in pid describe jlist status start delete save; do run_pm2 "$action"; done`);
  pass(result);
  assert.equal(result.stdout.trim().split("\n").length, 7);
  for (const line of result.stdout.trim().split("\n")) assert.match(line, /^\/root\/\.pm2:/);
});

const actions = `
current=/www/releases/jianlian-shop-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
pinnedCurrent="$current"
target=/www/releases/jianlian-shop-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
pm2() {
  printf 'CALL:%s:%s\\n' "$PM2_HOME" "$*"
  [[ "$1" != save || "\${FAIL_SAVE:-0}" != 1 ]]
}
assert_existing_release_path() { return 0; }
is_legacy_nested_release_path() { return 1; }
verify_runtime_release() { return 0; }
verify_prepare_marker() { return 0; }
verify_build_marker() { return 0; }
verify_ready_marker() { return 0; }
assert_release_env_matches_source() { return 0; }
current_pm2_cwd() { printf '%s\\n' "$pinnedCurrent"; }
pm2_app_exists() { run_pm2 describe "$APP_NAME"; }
wait_for_pm2_release() { return 0; }
wait_for_production_health() { return 0; }
${mockPublicCurl}
`;
for (const [name, invocation] of [
  ["switch", 'switch_release aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
  ["rollback", 'rollback_release "$target"'],
  ["recovery", 'restore_previous_release "$current"'],
]) {
  test(`${name} delete/start/save all use the controlled daemon`, () => {
    const result = run(`${actions}\n${invocation}`);
    pass(result);
    const calls = result.stdout.split("\n").filter((line) => line.startsWith("CALL:"));
    assert.deepEqual(calls.map((line) => line.split(":")[2].split(" ")[0]), ["describe", "delete", "start", "save"]);
    for (const line of calls) assert.match(line, /^CALL:\/root\/\.pm2:/);
    assert.match(result.stdout, /(?:RECOVERY_)?PM2_SAVE=PASS/);
  });
}

test("failed recovery save cannot report restored success even in a conditional", () => {
  const result = run(`${actions}\nFAIL_SAVE=1
if restore_previous_release "$current"; then exit 9; else printf 'RECOVERY_FAILED\\n'; fi`);
  pass(result);
  assert.match(result.stdout, /CALL:\/root\/\.pm2:save/);
  assert.match(result.stdout, /RECOVERY_PM2_SAVE=FAIL/);
  assert.doesNotMatch(result.stdout, /PM2_SAVE=PASS|PREVIOUS_RELEASE_RESTORED=PASS/);
});

for (const command of ['switch_release aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'rollback_release "$target"']) {
  test(`${command} failure reports successful recovery save accurately`, () => {
    const result = run(`${actions}
activate_release_fresh() { [[ "$1" == "$current" ]]; }
${command}`);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /RECOVERY_PM2_SAVE=PASS/);
    assert.match(result.stderr, /previous release restored and its PM2 state saved/);
    assert.doesNotMatch(result.stderr, /save was not run/);
  });
}

test("failed delete stops activation before start", () => {
  const result = run(`${actions}
pm2() { printf 'CALL:%s:%s\\n' "$PM2_HOME" "$*"; [[ "$1" != delete ]]; }
if activate_release_fresh "$target"; then exit 9; fi`);
  pass(result);
  assert.match(result.stdout, /:delete /);
  assert.doesNotMatch(result.stdout, /:start /);
});

for (const command of ['switch_release aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'rollback_release "$target"']) {
  test(`${command} final save failure is explicit and never reports success`, () => {
    const result = run(`${actions}\nFAIL_SAVE=1\n${command}`);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /CALL:\/root\/\.pm2:save/);
    assert.match(result.stderr, /is active but PM2 save failed/);
    assert.doesNotMatch(result.stdout, /PM2_SAVE=PASS|PRODUCTION_SWITCH=PASS|ROLLBACK_ASSESSMENT=PASS/);
  });
  test(`${command} public check failure restores and saves previous release`, () => {
    const result = run(`${actions}
activate_release_fresh() {
  if [[ "$1" == "$current" ]]; then WWW_LOGIN=200; else WWW_LOGIN=503; fi
}
${command}`);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /PUBLIC_CANONICAL__login=503[\s\S]*PUBLIC_CANONICAL__login=200/);
    assert.match(result.stdout, /RECOVERY_PM2_SAVE=PASS/);
    assert.match(result.stderr, /previous release restored and its PM2 state saved/);
    assert.equal(result.stdout.split("\n").filter(line => line === "CALL:/root/.pm2:save").length, 1);
  });
}

test("external verification runbook covers read-only payment safety acceptance", () => {
  const text = readFileSync(new URL("../../docs/operations/production-release-post-switch-verification.md", import.meta.url), "utf8");
  for (const required of ["/root/.pm2", "/products/account-recharge", "/api/recharges/channels", "jianlian-snpay-reconciliation.timer", "DB", "Provider", "Alipay=false", "WeChat=false", "USDT-BEP20=true"]) assert.ok(text.includes(required), required);
  assert.doesNotMatch(text, /curl.*(?:POST|--data)|systemctl\s+(?:start|enable|restart)/);
});
