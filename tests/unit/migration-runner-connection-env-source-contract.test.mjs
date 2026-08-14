import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("scripts/db/run-migration.ps1", "utf8");

test("migration runner decomposes validated URI into explicit libpq environment variables", () => {
  assert.match(source, /\$databaseUri = \[Uri\]\$databaseUrl/);
  assert.match(source, /\$env:PGHOST = \$databaseUri\.DnsSafeHost/);
  assert.match(source, /\$env:PGPORT = \[string\]\$databaseUri\.Port/);
  assert.match(source, /\$env:PGUSER = \$databaseUser/);
  assert.match(source, /\$env:PGPASSWORD = \$databasePassword/);
  assert.match(source, /\$env:PGDATABASE = \$databaseName/);
  assert.doesNotMatch(source, /\$env:PGDATABASE = \$databaseUrl/);
});

test("migration runner keeps credentials out of psql command arguments", () => {
  assert.doesNotMatch(source, /--dbname=.*\$databaseUrl/);
  assert.doesNotMatch(source, /-d\s+\$databaseUrl/);
  assert.match(source, /Credentials remain in the child process environment, never in arguments or logs/);
});
