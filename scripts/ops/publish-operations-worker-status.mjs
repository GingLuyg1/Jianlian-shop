#!/usr/bin/env node
// Privileged host-side observation only. Never imported by the Web Admin.
// Installation/scheduling requires separate rollout approval. Default: stdout
// safe status only; --publish writes only a sanitized runtime snapshot.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function observeWorker(run = spawnSync, now = new Date()) {
  const call = args => run('/usr/bin/systemctl', args, { encoding: 'utf8', timeout: 5000, maxBuffer: 16384 });
  const enabled = call(['is-enabled','jianlian-snpay-reconciliation.timer']);
  const active = call(['is-active','jianlian-snpay-reconciliation.timer']);
  const invocation = call(['show','jianlian-snpay-reconciliation.service','--property=InvocationID','--value']);
  const token = invocation.stdout?.trim();
  return {
    observed_at: now.toISOString(),
    timer_enabled: enabled.stdout?.trim() === 'enabled' ? true : ['disabled','static','masked'].includes(enabled.stdout?.trim()) ? false : null,
    timer_active: active.stdout?.trim() === 'active' ? true : ['inactive','failed'].includes(active.stdout?.trim()) ? false : null,
    invocation_id: /^[0-9a-f]{32}$/i.test(token ?? '') ? token : null,
  };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  if (process.platform !== 'linux' || process.getuid?.() !== 0) throw Error('HOST_ROOT_OBSERVATION_REQUIRED');
  if (process.argv.slice(2).some(arg => arg !== '--publish')) throw Error('UNSUPPORTED_ARGUMENT');
  const status = observeWorker();
  if (process.argv.includes('--publish')) {
    const directory='/run/jianlian-operations', file=directory+'/worker-status.json';
    mkdirSync(directory,{recursive:true,mode:0o700});
    writeFileSync(file+'.tmp',JSON.stringify(status),{mode:0o600,flag:'w'});renameSync(file+'.tmp',file);
  }
  console.log(JSON.stringify(status));
}
