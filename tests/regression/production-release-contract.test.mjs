import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const file = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("production release script enforces immutable release and recovery gates", () => {
  const script = file("scripts/production-release.sh");
  const ecosystem = file("ecosystem.production.config.cjs");

  for (const name of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SECRET_KEY",
    "DAJU_API_BASE_URL",
    "DAJU_API_KEY",
  ]) assert.match(script, new RegExp(`\\b${name}\\b`));

  assert.match(script, /set -Eeuo pipefail/);
  assert.match(script, /\^\[0-9a-fA-F\]\{40\}\$/);
  assert.match(script, /\^\/www\/releases\/jianlian-shop-\[0-9a-f\]\{40\}\$/);
  assert.match(script, /ENV_SOURCE="\$REPO\/\.env\.local"/);
  assert.match(script, /install -m 600 -- "\$ENV_SOURCE" "\$target\/\.env\.production\.local"/);
  assert.doesNotMatch(script, /^\s*(?:source|\.)\s+.*env/m);
  assert.doesNotMatch(script, /^\s*eval\b/m);
  assert.match(script, /assert_persistent_env_matches_current/);
  assert.match(script, /assert_release_env_matches_source/);
  assert.match(script, /df -Pk/);
  assert.match(script, /df -Pi/);
  assert.match(script, /JIANLIAN_MIN_FREE_KB:-3145728/);
  assert.match(script, /JIANLIAN_MIN_FREE_INODES:-150000/);
  assert.match(script, /worktree add --detach/);
  assert.match(script, /worktree remove --force "\$dir"/);
  assert.match(script, /worktree prune/);
  assert.match(script, /npm ci/);
  assert.match(script, /npm run build/);
  assert.match(script, /retry-build/);
  assert.match(script, /RETRY_ALLOWED/);
  assert.match(script, /RETRY_CONSUMED/);
  assert.doesNotMatch(script, /^\s*npm\s+audit\s+fix(?:\s|$)/m);
  assert.match(script, /exec \.\/node_modules\/\.bin\/next start -p "\$SMOKE_PORT"/);
  assert.match(script, /for path in \/api\/health \/ \/login/);
  assert.match(script, /restore_previous_release/);
  assert.match(script, /previous release restored and pm2 save was not run/);
  assert.match(script, /verify_ready_marker/);
  assert.match(script, /verify_prepare_marker/);
  assert.match(script, /verify_build_marker/);
  assert.match(script, /write_build_marker/);
  assert.match(script, /\.next\/BUILD_ID/);
  assert.match(script, /CLEANUP_CANDIDATE/);
  assert.match(script, /a separate cleanup dry-run plan is required before --confirm/);
  assert.match(script, /cleanup state changed since dry-run/);
  assert.match(script, /cmp -s - "\$plan"/);
  assert.doesNotMatch(script, /rm\s+-rf/);

  assert.match(ecosystem, /name: "jianlian-shop"/);
  assert.match(ecosystem, /args: "start -p 3001"/);
  assert.match(ecosystem, /cwd: releaseDir/);
  assert.doesNotMatch(ecosystem, /SUPABASE|DAJU|SECRET|API_KEY/);
});

test("release workflow excludes database, business-write and source-control side effects", () => {
  const script = file("scripts/production-release.sh");
  assert.doesNotMatch(script, /\bsupabase\b|\bpsql\b|\bmigration\s+(?:up|repair)|\bdb\s+(?:push|reset)/i);
  assert.doesNotMatch(script, /\/purchase\b|complete_account_recharge|balance_transactions/i);
  assert.doesNotMatch(script, /\bgit\s+push\b|\bgit\s+branch\s+-(?:d|D)\b/);
  assert.doesNotMatch(script, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/);
});

test("production runbook defines one immutable worktree release process", () => {
  const manual = file("docs/manual-production-deployment.md");
  assert.match(manual, /\/www\/jianlian-shop\/\.env\.local.*source of truth/i);
  assert.match(manual, /\/www\/releases\/jianlian-shop-<full_sha>/i);
  assert.match(manual, /3002/);
  assert.match(manual, /当前 Production release；[\s\S]*指定 rollback release；[\s\S]*正在构建的新 release/);
  assert.match(manual, /production-release\.sh rollback/);
  assert.match(manual, /3 GiB/);
  assert.match(manual, /retry-build/);
});
