// Synthetic POSIX acceptance only. No credentials, network or scanner runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMonitorStore } from './recharge-order-scan-monitor-store.mjs';
import { recordMonitorCycle } from './recharge-order-scan-alert-state.mjs';

assert.equal(process.platform, 'linux', 'Run this synthetic permission acceptance on Linux');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jl-monitor-synthetic-'));
  fs.chmodSync(directory, 0o700);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, file: path.join(directory, 'state.json') };
}
test('atomic persisted state has owner-only permissions and reloads', async t => {
  const f = fixture(t), store = createMonitorStore(f.file);
  await store.transact(async (state, save) => { state.noProgressCycles = 2; await save(state); });
  assert.equal(fs.statSync(f.directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(f.file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(f.file).uid, process.getuid());
  await createMonitorStore(f.file).transact(async state => assert.equal(state.noProgressCycles, 2));
  assert.deepEqual(fs.readdirSync(f.directory), ['state.json']);
});
test('parallel writer is rejected while the original transaction keeps its lock', async t => {
  const f = fixture(t), store = createMonitorStore(f.file);
  let release, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const pending = store.transact(async () => { entered(); await new Promise(resolve => { release = resolve; }); });
  await ready;
  await assert.rejects(createMonitorStore(f.file).transact(async () => assert.fail()), /STATE_LOCKED/);
  release(); await pending;
  await store.transact(async () => {});
});
test('existing loose file or directory is rejected without changing permissions', async t => {
  const f = fixture(t);
  fs.chmodSync(f.directory, 0o755);
  await assert.rejects(createMonitorStore(f.file).transact(async () => assert.fail()), /PERMISSIONS/);
  assert.equal(fs.statSync(f.directory).mode & 0o777, 0o755);
  fs.chmodSync(f.directory, 0o700); fs.writeFileSync(f.file, '{}', { mode: 0o644 });
  await assert.rejects(createMonitorStore(f.file).transact(async () => assert.fail()), /PERMISSIONS/);
  assert.equal(fs.statSync(f.file).mode & 0o777, 0o644);
});
test('dangling symlink and symlink parent are refused without replacement', async t => {
  const f = fixture(t);
  fs.symlinkSync(path.join(f.directory, 'not-present'), f.file);
  await assert.rejects(createMonitorStore(f.file).transact(async () => assert.fail()), /PERMISSIONS/);
  assert.ok(fs.lstatSync(f.file).isSymbolicLink());
  const alias = path.join(f.directory, 'alias'); fs.symlinkSync(f.directory, alias);
  await assert.rejects(createMonitorStore(path.join(alias, 'other.json')).transact(async () => assert.fail()), /SYMLINK/);
});
test('malformed existing state stops and is preserved rather than silently reset', async t => {
  const f = fixture(t); fs.writeFileSync(f.file, 'broken synthetic state', { mode: 0o600 });
  await assert.rejects(createMonitorStore(f.file).transact(async () => assert.fail()));
  assert.equal(fs.readFileSync(f.file, 'utf8'), 'broken synthetic state');
});
test('uncertain send survives process/store recreation without duplicate notification', async t => {
  const f = fixture(t); let attempts = 0;
  for (let n = 0; n < 3; n++) {
    await createMonitorStore(f.file).transact((state, save) => recordMonitorCycle({ state, save,
      observation: { mode: 'order_driven', cycleId: `run_${n}`, now: 1_800_000_000_000 + n * 120_000,
        success: false, httpStatus: 503, eligibleCount: 0, progressAdvanced: false, leasePresent: false, leaseUntil: null },
      providerHost: 'bsc-rpc.publicnode.com', send: async () => { attempts++; throw Error('synthetic timeout'); } }));
  }
  assert.equal(attempts, 1);
});
