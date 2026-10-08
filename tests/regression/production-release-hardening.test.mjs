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
verify_runtime_release() { return 0; }
verify_prepare_marker() { return 0; }
verify_build_marker() { return 0; }
verify_ready_marker() { return 0; }
assert_release_env_matches_source() { return 0; }
current_pm2_cwd() { printf '%s\\n' "$pinnedCurrent"; }
pm2_app_exists() { run_pm2 describe "$APP_NAME"; }
wait_for_pm2_release() { return 0; }
wait_for_production_health() { return 0; }
verify_public_endpoints() { return 0; }
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
checks=0
verify_public_endpoints() { checks=$((checks + 1)); [[ "$checks" -gt 1 ]]; }
${command}`);
    assert.equal(result.status, 1);
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
