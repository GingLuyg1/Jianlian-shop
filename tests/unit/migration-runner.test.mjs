import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const script = path.join(repoRoot, "scripts", "db", "run-migration.ps1");
const testRef = "czuoivbfxzachiobdohw";
const productionRef = "qvbovrvybirscaurwuov";
const powerShell = process.platform === "win32" ? "powershell.exe" : "pwsh";

function sha256(content) {
  return createHash("sha256").update(content).digest("hex").toUpperCase();
}

function invoke(args, env = {}) {
  return spawnSync(
    powerShell,
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, ...args],
    { cwd: repoRoot, encoding: "utf8", env: { ...process.env, ...env } },
  );
}

function baseArgs(file, sha, environment = "test", projectRef = testRef) {
  return [
    "-File", file,
    "-Environment", environment,
    "-ProjectRef", projectRef,
    "-ExpectedSha256", sha,
  ];
}

function makeFakePsql(directory, exitCode = 0) {
  const argsLog = path.join(directory, "psql-args.txt");
  const envLog = path.join(directory, "psql-env.txt");
  const fakePsql = process.platform === "win32"
    ? path.join(directory, "fake-psql.cmd")
    : path.join(directory, "fake-psql.sh");
  writeFileSync(
    fakePsql,
    process.platform === "win32"
      ? `@echo %*>>"${argsLog}"\r\n@echo PGHOSTADDR=%PGHOSTADDR%;PGSERVICE=%PGSERVICE%;PGSERVICEFILE=%PGSERVICEFILE%;PGSSLMODE=%PGSSLMODE%;PGCONNECT_TIMEOUT=%PGCONNECT_TIMEOUT%;PGAPPNAME=%PGAPPNAME%>>"${envLog}"\r\n@exit /b ${exitCode}\r\n`
      : `#!/bin/sh\nprintf '%s\\n' "$*" >> "${argsLog}"\nprintf 'PGHOSTADDR=%s;PGSERVICE=%s;PGSERVICEFILE=%s;PGSSLMODE=%s;PGCONNECT_TIMEOUT=%s;PGAPPNAME=%s\\n' "$PGHOSTADDR" "$PGSERVICE" "$PGSERVICEFILE" "$PGSSLMODE" "$PGCONNECT_TIMEOUT" "$PGAPPNAME" >> "${envLog}"\nexit ${exitCode}\n`,
    "utf8",
  );
  if (process.platform !== "win32") chmodSync(fakePsql, 0o755);
  return { fakePsql, argsLog, envLog };
}

test("migration runner validates immutable inputs and exact environment refs", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "jianlian-migration-runner-"));
  try {
    const sql = "-- header\nbegin;\nselect 1;\ncommit;\n";
    const file = path.join(directory, "valid.sql");
    writeFileSync(file, sql, "utf8");
    const sha = sha256(sql);

    const valid = invoke([...baseArgs(file, sha), "-ValidateOnly", "-PsqlCommand", "missing"]);
    assert.equal(valid.status, 0, valid.stderr);

    for (const [environment, projectRef] of [
      ["test", productionRef],
      ["production", testRef],
    ]) {
      const result = invoke([...baseArgs(file, sha, environment, projectRef), "-ValidateOnly"]);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /ENVIRONMENT_PROJECT_REF_MISMATCH/);
    }

    const conflicting = invoke([...baseArgs(file, sha), "-Execute", "-ValidateOnly"]);
    assert.notEqual(conflicting.status, 0);
    assert.match(conflicting.stderr, /MIGRATION_MODE_CONFLICT/);

    const afterCommit = "begin;\nselect 1;\ncommit;\nselect 2;\n";
    const afterCommitFile = path.join(directory, "after-commit.sql");
    writeFileSync(afterCommitFile, afterCommit, "utf8");
    const invalidBoundary = invoke([
      ...baseArgs(afterCommitFile, sha256(afterCommit)),
      "-ValidateOnly",
    ]);
    assert.notEqual(invalidBoundary.status, 0);
    assert.match(invalidBoundary.stderr, /MIGRATION_TRANSACTION_BOUNDARY_REQUIRED/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("migration runner only accepts exact official direct and pooler targets", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "jianlian-migration-targets-"));
  try {
    const sql = "begin;\nselect 1;\ncommit;\n";
    const file = path.join(directory, "valid.sql");
    writeFileSync(file, sql, "utf8");
    const sha = sha256(sql);
    const { fakePsql } = makeFakePsql(directory);
    const args = [...baseArgs(file, sha), "-PsqlCommand", fakePsql, "-DatabaseUrlEnvironmentVariable", "RUNNER_DB_URL"];

    for (const url of [
      `postgresql://postgres:secret@db.${testRef}.supabase.co:5432/postgres`,
      `postgresql://postgres.${testRef}:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
    ]) {
      const accepted = invoke(args, { RUNNER_DB_URL: url });
      assert.equal(accepted.status, 0, accepted.stderr);
    }

    for (const [url, code] of [
      [`postgresql://postgres:secret@evil-${testRef}.example.com/postgres`, "DATABASE_HOST_NOT_ALLOWED"],
      [`postgresql://postgres.wrongprojectref0000:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres`, "DATABASE_POOLER_USERNAME_PROJECT_REF_MISMATCH"],
      [`postgresql://postgres:secret@db.${testRef}.supabase.co:6543/postgres`, "DATABASE_PORT_NOT_ALLOWED"],
      [`postgresql://postgres.${testRef}:secret@aws-0-us-east-1.pooler.supabase.com:7777/postgres`, "DATABASE_PORT_NOT_ALLOWED"],
      [`postgresql://postgres:secret@db.${testRef}.supabase.co:5432/other`, "DATABASE_NAME_NOT_ALLOWED"],
      [`postgresql://postgres:secret@db.${testRef}.supabase.co:5432/postgres#fragment`, "DATABASE_URL_OPTIONS_NOT_ALLOWED"],
      [`postgresql://postgres:secret@db.${testRef}.supabase.co:5432/postgres?hostaddr=127.0.0.1`, "DATABASE_URL_OPTIONS_NOT_ALLOWED"],
      [`postgresql://postgres:secret@db.${testRef}.supabase.co:5432/postgres?host=evil.example.com`, "DATABASE_URL_OPTIONS_NOT_ALLOWED"],
      [`postgresql://postgres:secret@db.${testRef}.supabase.co:5432/postgres?service=override`, "DATABASE_URL_OPTIONS_NOT_ALLOWED"],
      [`postgresql://postgres:secret@db.${testRef}.supabase.co:5432/postgres?sslmode=disable`, "DATABASE_URL_OPTIONS_NOT_ALLOWED"],
    ]) {
      const rejected = invoke(args, { RUNNER_DB_URL: url });
      assert.notEqual(rejected.status, 0);
      assert.match(rejected.stderr, new RegExp(code));
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("migration runner dry-run only checks identity and execute alone uses --file", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "jianlian-migration-modes-"));
  try {
    const sql = "begin;\nselect 1;\ncommit;\n";
    const file = path.join(directory, "valid.sql");
    writeFileSync(file, sql, "utf8");
    const sha = sha256(sql);
    const { fakePsql, argsLog } = makeFakePsql(directory);
    const common = [
      ...baseArgs(file, sha),
      "-PsqlCommand", fakePsql,
      "-DatabaseUrlEnvironmentVariable", "RUNNER_DB_URL",
    ];
    const env = {
      RUNNER_DB_URL: `postgresql://postgres:secret@db.${testRef}.supabase.co:5432/postgres`,
    };

    const dryRun = invoke(common, env);
    assert.equal(dryRun.status, 0, dryRun.stderr);
    const dryArgs = readFileSync(argsLog, "utf8");
    assert.match(dryArgs, /current_database\(\), current_user/);
    assert.doesNotMatch(dryArgs, /--file/);

    writeFileSync(argsLog, "", "utf8");
    const execute = invoke([...common, "-Execute"], env);
    assert.equal(execute.status, 0, execute.stderr);
    assert.match(readFileSync(argsLog, "utf8"), /--file/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("migration runner clears inherited libpq overrides and applies safe connection settings", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "jianlian-migration-libpq-"));
  try {
    const sql = "begin;\nselect 1;\ncommit;\n";
    const file = path.join(directory, "valid.sql");
    writeFileSync(file, sql, "utf8");
    const { fakePsql, envLog } = makeFakePsql(directory);
    const inherited = {
      RUNNER_DB_URL: `postgresql://postgres:secret@db.${testRef}.supabase.co:5432/postgres`,
      PGHOSTADDR: "127.0.0.1",
      PGSERVICE: "unsafe-service",
      PGSERVICEFILE: "unsafe-service-file",
      PGSSLMODE: "disable",
    };
    const result = invoke([
      ...baseArgs(file, sha256(sql)),
      "-PsqlCommand", fakePsql,
      "-DatabaseUrlEnvironmentVariable", "RUNNER_DB_URL",
    ], inherited);
    assert.equal(result.status, 0, result.stderr);
    const childEnvironment = readFileSync(envLog, "utf8");
    assert.match(childEnvironment, /PGHOSTADDR=;/);
    assert.match(childEnvironment, /PGSERVICE=;/);
    assert.match(childEnvironment, /PGSERVICEFILE=;/);
    assert.match(childEnvironment, /PGSSLMODE=require/);
    assert.match(childEnvironment, /PGCONNECT_TIMEOUT=15/);
    assert.match(childEnvironment, /PGAPPNAME=jianlian-migration-runner/);
    assert.equal(inherited.PGHOSTADDR, "127.0.0.1");
    assert.equal(inherited.PGSERVICE, "unsafe-service");
    assert.equal(inherited.PGSSLMODE, "disable");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("production execution requires the exact confirmation text", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "jianlian-migration-production-"));
  try {
    const sql = "begin;\nselect 1;\ncommit;\n";
    const file = path.join(directory, "valid.sql");
    writeFileSync(file, sql, "utf8");
    const sha = sha256(sql);
    const { fakePsql } = makeFakePsql(directory);
    const common = [
      ...baseArgs(file, sha, "production", productionRef),
      "-Execute",
      "-PsqlCommand", fakePsql,
      "-DatabaseUrlEnvironmentVariable", "RUNNER_DB_URL",
    ];
    const env = {
      RUNNER_DB_URL: `postgresql://postgres:secret@db.${productionRef}.supabase.co:5432/postgres`,
    };
    const missing = invoke(common, env);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /PRODUCTION_CONFIRMATION_TEXT_INVALID/);

    const confirmation = `EXECUTE PRODUCTION MIGRATION ${productionRef} valid.sql ${sha}`;
    const accepted = invoke([...common, "-ConfirmationText", confirmation], env);
    assert.equal(accepted.status, 0, accepted.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("migration runner preserves psql failure status and never prints credentials", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "jianlian-migration-exit-"));
  const password = "DO_NOT_PRINT_THIS_PASSWORD";
  try {
    const sql = "begin;\nselect 1;\ncommit;\n";
    const file = path.join(directory, "valid.sql");
    writeFileSync(file, sql, "utf8");
    const { fakePsql } = makeFakePsql(directory, 7);
    const result = invoke([
      ...baseArgs(file, sha256(sql)),
      "-PsqlCommand", fakePsql,
      "-DatabaseUrlEnvironmentVariable", "RUNNER_DB_URL",
    ], {
      RUNNER_DB_URL: `postgresql://postgres:${password}@db.${testRef}.supabase.co:5432/postgres`,
    });
    assert.equal(result.status, 7);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(password));
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /postgresql:\/\//);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
