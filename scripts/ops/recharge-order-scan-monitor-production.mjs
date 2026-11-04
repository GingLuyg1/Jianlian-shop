import fs from 'node:fs';
import cp from 'node:child_process';
import os from 'node:os';
import { createRequire } from 'node:module';
import { createMonitorStore } from './recharge-order-scan-monitor-store.mjs';
import { createOrderDrivenMonitor, createOrderScanSnapshotReader } from './recharge-order-scan-monitor.mjs';

const need = ok => { if (!ok) throw Error('ORDER_MONITOR_RUNTIME_INVALID'); };
const PROJECT_HOST = 'qvbovrvybirscaurwuov.supabase.co';
const STATE_FILE = '/var/lib/jianlian/recharge-order-monitor/state-v1.json';

// Match the application's actual PM2 cwd and Next env semantics, without
// dumping pm2_env or sourcing/evaluating env text. All credentials stay local.
export function loadMonitorRuntime() {
  need(process.getuid?.() === 0 && os.hostname() === 'VM-TYO1-PQCDTLVUKG');
  const apps = JSON.parse(cp.execFileSync('pm2', ['jlist'], { encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, PM2_HOME: '/root/.pm2' }, stdio: ['ignore', 'pipe', 'pipe'] }));
  const matches = apps.filter(app => app.name === 'jianlian-shop');
  need(matches.length === 1);
  const app = matches[0]; need(app.pid > 0 && app.pm2_env.status === 'online');
  const cwd = fs.realpathSync(`/proc/${app.pid}/cwd`);
  need(/^\/www\/releases\/jianlian-shop-[a-f0-9]{40}$/.test(cwd) && app.pm2_env.pm_cwd === cwd);
  const p = cwd + '/.env.production.local', stat = fs.lstatSync(p);
  need(stat.isFile() && !stat.isSymbolicLink() && stat.uid === 0 && (stat.mode & 0o777) === 0o600);
  const require = createRequire(cwd + '/package.json'), prior = process.env;
  let environment;
  try {
    process.env = Object.fromEntries(fs.readFileSync(`/proc/${app.pid}/environ`, 'utf8').split('\0')
      .filter(line => line.includes('=')).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
    process.env.NODE_ENV = 'production';
    require('@next/env').loadEnvConfig(cwd, false, { info() {}, error() {} });
    environment = { ...process.env };
  } finally { process.env = prior; }
  need(['legacy', 'order_driven'].includes(environment.RECHARGE_BEP20_SCANNER_MODE));
  const mode = environment.RECHARGE_BEP20_SCANNER_MODE;
  const rpc = new URL(environment.RECHARGE_BEP20_RPC_URL || environment.BSC_RPC_URL);
  need(rpc.protocol === 'https:');
  if (mode === 'legacy') return { mode, providerHost: rpc.hostname };
  const url = new URL(environment.NEXT_PUBLIC_SUPABASE_URL);
  need(url.protocol === 'https:' && url.hostname === PROJECT_HOST && !url.username && !url.password && !url.search && !url.hash);
  const key = environment.SUPABASE_SECRET_KEY || environment.SUPABASE_SERVICE_ROLE_KEY;
  need(typeof key === 'string' && key.trim());
  const { createClient } = require('@supabase/supabase-js');
  const service = createClient(url.origin, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, options) => fetch(input, { ...options, redirect: 'error', signal: AbortSignal.timeout(10_000) }) },
  });
  // Preserve the existing systemd email configuration. Fallback only for the
  // same app's existing Resend/from keys, never a new recipient or credential.
  const email = {
    apiKey: prior.RESEND_API_KEY || environment.RESEND_API_KEY,
    from: prior.EMAIL_FROM || environment.EMAIL_FROM,
    recipient: prior.BEP20_ALERT_RECIPIENT || environment.BEP20_ALERT_RECIPIENT,
  };
  for (const value of Object.values(email)) need(typeof value === 'string' && value.trim() && value.length <= 1024 && !/[\r\n]/.test(value));
  return { mode, providerHost: rpc.hostname, email,
    readSnapshot: createOrderScanSnapshotReader(service, environment.BSC_USDT_CONTRACT) };
}

export function createMonitorResendSender(email, fetchImpl = fetch) {
  return async ({ subject, text, idempotencyKey }) => {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { authorization: `Bearer ${email.apiKey}`, 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
      body: JSON.stringify({ from: email.from, to: [email.recipient], subject, text }),
    });
    await response.body?.cancel().catch(() => {});
    if (!response.ok) throw Error('ORDER_MONITOR_EMAIL_FAILED');
  };
}

export function createProductionOrderScanMonitor({ loadRuntime = loadMonitorRuntime } = {}) {
  let monitor;
  const get = () => {
    if (!monitor) {
      const runtime = loadRuntime();
      monitor = createOrderDrivenMonitor({ ...runtime, store: createMonitorStore(STATE_FILE),
        send: runtime.mode === 'order_driven' ? createMonitorResendSender(runtime.email) : async () => {} });
    }
    return monitor;
  };
  return {
    isOrderDriven: () => get().isOrderDriven(),
    fetchScanner: (...args) => get().fetchScanner(...args),
    async operationalFailure() {
      try { await get().operationalFailure(); }
      catch { console.error('ORDER_SCAN_MONITOR_ERROR=RUNTIME_CONFIGURATION'); }
    },
  };
}
