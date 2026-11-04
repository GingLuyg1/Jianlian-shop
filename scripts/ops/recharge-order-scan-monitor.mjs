import { randomUUID } from 'node:crypto';
import { durableProgressAdvanced, recordMonitorCycle } from './recharge-order-scan-alert-state.mjs';

const SCANNER_URL = 'http://127.0.0.1:3001/api/internal/recharges/bep20/scan';
const need = ok => { if (!ok) throw Error('ORDER_MONITOR_READ_INVALID'); };
const address = value => {
  const normalized = String(value ?? '').trim().toLowerCase();
  need(/^0x[a-f0-9]{40}$/.test(normalized)); return normalized;
};

// Only SELECTs and the already audited p_dry_run=true RPC. No cursor/lease
// mutation, budget claim, matching/crediting, balance or ledger API exists here.
export function createOrderScanSnapshotReader(service, tokenContract) {
  async function lease() {
    const r = await service.from('account_recharge_order_scan_control')
      .select('mode,lease_until,lease_token').eq('singleton', true).single();
    need(!r.error && r.data?.mode === 'order_driven');
    need(r.data.lease_token === null || typeof r.data.lease_token === 'string' && /^[a-f0-9-]{36}$/.test(r.data.lease_token));
    const until = r.data.lease_until === null ? null : Date.parse(r.data.lease_until);
    need(until === null || Number.isSafeInteger(until));
    need((r.data.lease_token === null) === (until === null));
    return { leasePresent: r.data.lease_token !== null, leaseUntil: until };
  }
  return {
    async before() {
      const channel = await service.from('payment_channels').select('public_config')
        .or('code.eq.usdt_bep20,channel.eq.usdt_bep20').eq('enabled', true).eq('configured', true).maybeSingle();
      need(!channel.error && channel.data);
      const config = channel.data.public_config;
      const contract = address(tokenContract); need(address(config?.token_contract) === contract);
      const r = await service.rpc('lease_recharge_order_scan_v1', {
        p_address: address(config.payment_address), p_contract: contract, p_dry_run: true,
      });
      need(!r.error && r.data?.token === null && Array.isArray(r.data?.windows) && r.data.windows.length <= 1000);
      const windows = r.data.windows.map(w => {
        need(typeof w.id === 'string' && /^[a-f0-9-]{36}$/.test(w.id));
        need(w.last_scanned_block === null || typeof w.last_scanned_block === 'string' && /^\d+$/.test(w.last_scanned_block));
        return { id: w.id, last_scanned_block: w.last_scanned_block, complete: false };
      });
      need(new Set(windows.map(w => w.id)).size === windows.length);
      return { windows, ...await lease() };
    },
    async after(before) {
      const rows = [];
      for (let i = 0; i < before.windows.length; i += 100) {
        const ids = before.windows.slice(i, i + 100).map(w => w.id);
        const r = await service.from('account_recharge_order_scan_progress')
          .select('recharge_id,last_scanned_block,complete').in('recharge_id', ids);
        need(!r.error && Array.isArray(r.data));
        for (const row of r.data) {
          need(ids.includes(row.recharge_id));
          // PostgREST numeric columns may be numbers. Reject unsafe conversion.
          need(row.last_scanned_block === null || typeof row.last_scanned_block === 'string' ||
            Number.isSafeInteger(row.last_scanned_block) && row.last_scanned_block >= 0);
          rows.push({ id: row.recharge_id, last_scanned_block: row.last_scanned_block === null ? null : String(row.last_scanned_block), complete: row.complete });
        }
      }
      need(new Set(rows.map(row => row.id)).size === rows.length);
      const byId = new Map(rows.map(row => [row.id, row]));
      const after = before.windows.map(old => byId.get(old.id) ?? { id: old.id, last_scanned_block: null, complete: false });
      return { progressAdvanced: durableProgressAdvanced(before.windows, after), ...await lease() };
    },
  };
}

async function safeResponse(response) {
  const reader = response.clone().body?.getReader(); need(reader);
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength; need(size <= 65536); chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const success = response.ok && body.success === true && body.dryRun === false;
    if (success) {
      need(body.mode === 'order_driven');
      for (const key of ['headBlock', 'finalizedBlock', 'fromBlock', 'toBlock']) need(typeof body[key] === 'string' && /^\d+$/.test(body[key]));
    }
    return { success, code: body.code === 'ORDER_SCAN_BUSY' ? 'ORDER_SCAN_BUSY' : null };
  // A cancelled cloned/tee branch can wait for the original consumer. Do not
  // await that cancellation before returning the original to its consumer.
  } finally { void reader.cancel().catch(() => {}); }
}

// Decorates the EXISTING runner's one HTTP call. Tests inject fetch/snapshots/
// store/Resend; importing this module never executes a scanner or sends email.
export function createOrderDrivenMonitor({ mode, providerHost, readSnapshot, store, send,
  fetchImpl = fetch, now = Date.now, cycleId = randomUUID(), write = line => console.log(line) }) {
  let observed = false;
  const isOrderDriven = () => mode === 'order_driven';
  async function record(fields) {
    try {
      const r = await store.transact((state, save) => recordMonitorCycle({ state, save, send, providerHost,
        observation: { mode, cycleId, now: now(), httpStatus: 0, success: false,
          eligibleCount: 0, progressAdvanced: false, leasePresent: false, leaseUntil: null, ...fields } }));
      observed = true;
      write(`ORDER_SCAN_MONITOR=${r.state.status} NOTIFICATION=${r.notification}`);
    } catch { write('ORDER_SCAN_MONITOR_ERROR=STATE_OR_NOTIFICATION_FAILED'); }
  }
  return {
    isOrderDriven,
    async operationalFailure() {
      if (isOrderDriven() && !observed) await record({ success: false });
    },
    async fetchScanner(url, options) {
      if (!isOrderDriven()) return fetchImpl(url, options);
      need(url === SCANNER_URL && options?.method === 'POST');
      let before = null;
      try { before = await readSnapshot.before(); } catch { /* Report monitoring failure, still run the original scanner once. */ }
      let response;
      try { response = await fetchImpl(url, options); }
      catch (error) {
        await record({ ...before, eligibleCount: before?.windows.length ?? 0, success: false });
        throw error;
      }
      try {
        const result = await safeResponse(response);
        let after;
        if (before) after = await readSnapshot.after(before);
        await record({ ...after, eligibleCount: before?.windows.length ?? 0,
          success: Boolean(before && after && result.success), httpStatus: response.status, code: result.code });
      } catch { await record({ success: false, httpStatus: response.status }); }
      // Return the untouched response: preserve existing result validation,
      // counters, unmatched/conflict alerts, exit status and timer semantics.
      return response;
    },
  };
}
