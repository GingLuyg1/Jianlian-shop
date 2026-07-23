import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const script = path.join(repoRoot, "scripts", "db", "run-migration.ps1");
const projectRef = "abcdefghijklmnopqrst";
const powerShell = process.platform === "win32" ? "powershell.exe" : "pwsh";

function sha256(content) {
  return createHash("sha256").update(content).digest("hex").toUpperCase();
}

function invoke(args, env = {}) {
  return spawnSync(
    powerShell,
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, ...args],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, ...env },
    },
  );
}

test("single-session migration runner fails closed before psql execution", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "jianlian-migration-runner-"));
  try {
    const validSql = "begin;\nselect 1;\ncommit;\n";
    const validFile = path.join(directory, "valid.sql");
    writeFileSync(validFile, validSql, "utf8");
    const validSha = sha256(validSql);

    const validated = invoke([
      "-File", validFile,
      "-Environment", "test",
      "-ProjectRef", projectRef,
      "-ExpectedSha256", validSha,
      "-ValidateOnly",
      "-PsqlCommand", "definitely-not-a-real-psql-command",
    ]);
    assert.equal(validated.status, 0, validated.stderr);
    assert.match(validated.stdout, /"result":\s*"validated"/);

    const missing = invoke([
      "-File", path.join(directory, "missing.sql"),
      "-Environment", "test",
      "-ProjectRef", projectRef,
      "-ExpectedSha256", validSha,
      "-ValidateOnly",
    ]);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /MIGRATION_FILE_NOT_FOUND/);

    const mismatched = invoke([
      "-File", validFile,
      "-Environment", "test",
      "-ProjectRef", projectRef,
      "-ExpectedSha256", "A".repeat(64),
      "-ValidateOnly",
    ]);
    assert.notEqual(mismatched.status, 0);
    assert.match(mismatched.stderr, /MIGRATION_SHA256_MISMATCH/);

    const unsafeSql = "select 1;\n";
    const unsafeFile = path.join(directory, "unsafe.sql");
    writeFileSync(unsafeFile, unsafeSql, "utf8");
    const missingBoundary = invoke([
      "-File", unsafeFile,
      "-Environment", "test",
      "-ProjectRef", projectRef,
      "-ExpectedSha256", sha256(unsafeSql),
      "-ValidateOnly",
    ]);
    assert.notEqual(missingBoundary.status, 0);
    assert.match(missingBoundary.stderr, /MIGRATION_TRANSACTION_BOUNDARY_REQUIRED/);

    const productionWithoutConfirmation = invoke([
      "-File", validFile,
      "-Environment", "production",
      "-ProjectRef", projectRef,
      "-ExpectedSha256", validSha,
      "-Execute",
      "-ValidateOnly",
    ]);
    assert.notEqual(productionWithoutConfirmation.status, 0);
    assert.match(productionWithoutConfirmation.stderr, /PRODUCTION_CONFIRMATION_TEXT_INVALID/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("migration runner preserves psql failure status and never prints the database password", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "jianlian-migration-psql-"));
  const passwordMarker = "DO_NOT_PRINT_THIS_PASSWORD";
  try {
    const sql = "begin;\nselect 1;\ncommit;\n";
    const sqlFile = path.join(directory, "valid.sql");
    writeFileSync(sqlFile, sql, "utf8");
    const fakePsql = process.platform === "win32"
      ? path.join(directory, "fake-psql.cmd")
      : path.join(directory, "fake-psql.sh");
    writeFileSync(
      fakePsql,
      process.platform === "win32" ? "@exit /b 7\r\n" : "#!/bin/sh\nexit 7\n",
      "utf8",
    );
    if (process.platform !== "win32") chmodSync(fakePsql, 0o755);

    const result = invoke([
      "-File", sqlFile,
      "-Environment", "test",
      "-ProjectRef", projectRef,
      "-ExpectedSha256", sha256(sql),
      "-DatabaseUrlEnvironmentVariable", "JIANLIAN_TEST_DATABASE_URL",
      "-PsqlCommand", fakePsql,
    ], {
      JIANLIAN_TEST_DATABASE_URL: `postgresql://test:${passwordMarker}@${projectRef}.example.com:5432/postgres`,
    });

    assert.equal(result.status, 7);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(passwordMarker));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
