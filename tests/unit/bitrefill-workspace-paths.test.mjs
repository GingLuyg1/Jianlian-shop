import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, rm, rmdir, symlink, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  createWorkspaceBackend, createSyntheticWorkspaceFixture, isAllowedWindowsWorkspaceDirectory,
} from "../../scripts/support/bitrefill-workspace-backend.mjs";

async function fixtureFor(t) {
  const fixture = await createSyntheticWorkspaceFixture();
  assert.match(fixture.directory, /[\\/]jianlian-bitrefill-synthetic-[A-Za-z0-9]+$/);
  t.after(() => rm(fixture.directory, { recursive: true, force: true }));
  return fixture;
}

test("workspace Windows allowlist rejects traversal, siblings, UNC, device paths and extra depth on every OS", () => {
  for (const path of ["D:/Jianlian/_bitrefill_test/workspace", "d:\\Jianlian\\_bitrefill_test", "D:/Jianlian/_bitrefill_a-b_1/test-1"]) {
    assert.equal(isAllowedWindowsWorkspaceDirectory(path), true, path);
  }
  for (const path of [undefined, null, {}, "", "_bitrefill_test", "D:Jianlian/_bitrefill_test",
    "C:/Jianlian/_bitrefill_test", "D:/Jianlian-other/_bitrefill_test", "D:/Jianlian/Jianlian-shop",
    "D:/Jianlian/_bitrefill_test/a/b", "D:/Jianlian/_bitrefill_test/../_bitrefill_other",
    "D:/Jianlian/./_bitrefill_test", "D:/Jianlian/_bitrefill_test/a/..", "D:/Jianlian/_bitrefill_test/",
    "D:\\Jianlian\\_bitrefill_test\\..\\_bitrefill_other", "\\\\server\\D$\\Jianlian\\_bitrefill_test",
    "\\\\?\\D:\\Jianlian\\_bitrefill_test", "D:/Jianlian/_bitrefill_test:stream", "/tmp/_bitrefill_test",
    "D:/Jianlian/_bitrefill_test\0"]) {
    assert.equal(isAllowedWindowsWorkspaceDirectory(path), false, String(path));
  }
});

test("workspace synthetic capability owns a fresh path and cannot authorize caller-selected paths", async (t) => {
  const fixture = await fixtureFor(t);
  const second = await fixtureFor(t);
  assert.notEqual(fixture.directory, second.directory);
  assert.equal(Object.isFrozen(fixture), true);
  assert.equal((await lstat(fixture.directory)).isSymbolicLink(), false);
  await assert.rejects(() => createSyntheticWorkspaceFixture("/tmp/arbitrary"), /PATH_NOT_ALLOWED/);
  assert.throws(() => fixture.open(second.directory), /PATH_NOT_ALLOWED/);
  await assert.rejects(() => createWorkspaceBackend(fixture.directory, { synthetic: true }), /PATH_NOT_ALLOWED/);
  await assert.rejects(() => createWorkspaceBackend(resolve(".")), /PATH_NOT_ALLOWED/);
  if (process.platform !== "win32") {
    await assert.rejects(() => createWorkspaceBackend("D:/Jianlian/_bitrefill_test/workspace"), /PATH_NOT_ALLOWED/);
  }
});

test("workspace synthetic reopening rejects directory links and leaves their targets unchanged", async (t) => {
  const fixture = await fixtureFor(t), outside = await fixtureFor(t);
  await writeFile(join(outside.directory, "sentinel"), "SYNTHETIC_UNCHANGED", { flag: "wx" });
  await rmdir(fixture.directory);
  await symlink(outside.directory, fixture.directory, process.platform === "win32" ? "junction" : "dir");
  try {
    await assert.rejects(() => fixture.open(), /REPARSE_NOT_ALLOWED/);
    assert.equal(await readFile(join(outside.directory, "sentinel"), "utf8"), "SYNTHETIC_UNCHANGED");
  } finally {
    if (process.platform === "win32") await rmdir(fixture.directory);
    else await rm(fixture.directory);
  }
});

test("workspace metadata links, invalid JSON and oversized files fail closed and release the writer lock", async (t) => {
  const fixture = await fixtureFor(t), outside = await fixtureFor(t);
  const statePath = join(fixture.directory, "metadata.json");
  await symlink(outside.directory, statePath, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(() => fixture.open(), /STATE_INVALID/);
  if (process.platform === "win32") await rmdir(statePath);
  else await rm(statePath);
  for (const invalid of ["[]", "null", "not-json", " ".repeat(4 * 1024 * 1024 + 1)]) {
    await writeFile(statePath, invalid);
    await assert.rejects(() => fixture.open());
    await assert.rejects(() => lstat(join(fixture.directory, "workspace.lock")), { code: "ENOENT" });
  }
  await writeFile(statePath, "{}");
  const backend = await fixture.open();
  try {
    await backend.transact((s) => { s.marker = "SYNTHETIC_COMMITTED"; });
    const before = await readFile(statePath, "utf8");
    await assert.rejects(() => backend.transact((s) => { s.large = "x".repeat(4 * 1024 * 1024); }), /SIZE_LIMIT/);
    await assert.rejects(() => backend.transact(async (s) => { s.marker = "NOT_COMMITTED"; }), /SYNC_TRANSACTION_REQUIRED/);
    assert.equal(await readFile(statePath, "utf8"), before);
    assert.deepEqual(await backend.read(), { marker: "SYNTHETIC_COMMITTED" });
    await backend.transact((s) => { s.afterRejectedWrite = true; });
  } finally { await backend.close(); }
  await assert.rejects(() => backend.read(), /WORKSPACE_CLOSED/);
});

// The Windows-only native IO case is registered only on Windows. Every OS runs
// the Windows lexical guard plus native synthetic persistence and link cases.
if (process.platform === "win32") test("workspace actual Windows directory policy retains persistence, locks and junction rejection", async (t) => {
  const directory = `D:/Jianlian/_bitrefill_ci_path_${randomUUID()}`;
  assert.equal(isAllowedWindowsWorkspaceDirectory(directory), true);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const backend = await createWorkspaceBackend(directory);
  try {
    assert.equal(backend.synthetic, false);
    await assert.rejects(() => createWorkspaceBackend(directory), { code: "EEXIST" });
    await backend.transact((s) => { s.marker = "SYNTHETIC_WINDOWS_ONLY"; });
  } finally { await backend.close(); }
  const reopened = await createWorkspaceBackend(directory);
  try { assert.equal((await reopened.read()).marker, "SYNTHETIC_WINDOWS_ONLY"); }
  finally { await reopened.close(); }
  await rm(directory, { recursive: true });
  const outside = await fixtureFor(t);
  await symlink(outside.directory, directory, "junction");
  try { await assert.rejects(() => createWorkspaceBackend(directory), /REPARSE_NOT_ALLOWED/); }
  finally { await rmdir(directory); }
});
