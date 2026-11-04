import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const ORIGINAL_RUNNER_SHA256 = 'ecf076f403beeaf991977209fe46920ca09e32a3d4b7dc5005130f041f84f1bf';
export function patchOrderScanRunner(source, moduleFile, expectedSHA = ORIGINAL_RUNNER_SHA256) {
  if (createHash('sha256').update(source).digest('hex') !== expectedSHA) throw Error('ORDER_MONITOR_RUNNER_IDENTITY_MISMATCH');
  if (!/^\/www\/ops\/jianlian-order-monitor-[a-f0-9]{40}\/scripts\/ops\/recharge-order-scan-monitor-production\.mjs$/.test(moduleFile)) {
    throw Error('ORDER_MONITOR_MODULE_PATH_INVALID');
  }
  let result = source.toString('utf8');
  const replace = (expression, replacement) => {
    const matches = [...result.matchAll(new RegExp(expression.source, expression.flags.includes('g') ? expression.flags : expression.flags + 'g'))];
    if (matches.length !== 1) throw Error('ORDER_MONITOR_RUNNER_ANCHOR_MISMATCH');
    result = result.replace(expression, replacement);
  };
  replace(/^#!\/usr\/bin\/env node\r?\n/, line => line +
    `import { createProductionOrderScanMonitor } from ${JSON.stringify(pathToFileURL(moduleFile).href)};\nconst orderMonitor = createProductionOrderScanMonitor();\n`);
  replace(/await fetch\(\s*SCANNER_URL,/, 'await orderMonitor.fetchScanner(\n      SCANNER_URL,');
  replace(/async function sendOperationalFailure\(\{[\s\S]*?\}\)\s*\{/, header => header +
    '\n  if (orderMonitor.isOrderDriven()) { await orderMonitor.operationalFailure(); return; }');
  replace(/lag > MAX_LAG_BLOCKS/, '!orderMonitor.isOrderDriven() && lag > MAX_LAG_BLOCKS');
  replace(/\} catch \(error\) \{\s*console\.error\(\s*"SCANNER_RUNNER_FAILED="/, text =>
    text.replace('console.error(', 'await orderMonitor.operationalFailure();\n  console.error('));
  return result;
}

// Preparation ONLY: source is preserved, candidate is exclusive-create 0600,
// syntax checked without executing it. No install/unit edit/restart/HTTP/SQL.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [source, candidate, moduleFile, ...extra] = process.argv.slice(2);
    if (extra.length || !source || !candidate || !moduleFile || !path.isAbsolute(source) || !path.isAbsolute(candidate) ||
      path.resolve(source) === path.resolve(candidate) || fs.lstatSync(source).isSymbolicLink()) throw Error('ORDER_MONITOR_PREPARE_ARGUMENTS');
    const identity = /^(\/www\/ops\/jianlian-order-monitor-([a-f0-9]{40}))\/scripts\/ops\/recharge-order-scan-monitor-production\.mjs$/.exec(moduleFile);
    if (!identity || fs.realpathSync(moduleFile) !== moduleFile || !fs.lstatSync(moduleFile).isFile()) throw Error('ORDER_MONITOR_MODULE_IDENTITY');
    const git = args => cp.execFileSync('git', ['-C', identity[1], ...args], { encoding: 'utf8', timeout: 10_000, stdio: 'pipe' }).trim();
    if (git(['rev-parse', 'HEAD']) !== identity[2] || git(['status', '--porcelain']) !== '') throw Error('ORDER_MONITOR_MODULE_IDENTITY');
    const patched = patchOrderScanRunner(fs.readFileSync(source), moduleFile);
    const fd = fs.openSync(candidate, 'wx', 0o600);
    try { fs.writeFileSync(fd, patched); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    const check = cp.spawnSync(process.execPath, ['--check', candidate], { stdio: 'pipe', timeout: 10_000 });
    if (check.status !== 0) throw Error('ORDER_MONITOR_CANDIDATE_SYNTAX');
    console.log('MONITOR_CANDIDATE_SHA256=' + createHash('sha256').update(patched).digest('hex'));
    console.log('MONITOR_CANDIDATE_SYNTAX=PASS INSTALLED=no SCANNER_EXECUTED=no');
  } catch (error) {
    console.error(/^ORDER_MONITOR_[A-Z_]+$/.test(error.message) ? error.message : 'ORDER_MONITOR_PREPARE_FAILED');
    process.exitCode = 1;
  }
}
