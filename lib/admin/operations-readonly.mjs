import { boundedListInteger } from './list-pagination.mjs';

export class OperationsReadError extends Error {}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function operationsFilters(params) {
  const text = (key) => (params.get(key) ?? '').trim();
  const q = text('q');
  if (q.length > 100 || (q && !/^[\p{L}\p{N}@. _:+-]+$/u.test(q))) throw new OperationsReadError('搜索格式无效');
  const filters = { q, page: boundedListInteger(text('page'), 1, 1, 100000), pageSize: 50 };
  for (const key of ['status', 'business_type', 'direction', 'currency']) {
    const value = text(key);
    if (value && !/^[a-zA-Z0-9_]{1,40}$/.test(value)) throw new OperationsReadError('筛选格式无效');
    filters[key] = value;
  }
  for (const key of ['start', 'end']) {
    const value = text(key);
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new OperationsReadError('日期格式无效');
    filters[key] = value ? value + (key === 'end' ? 'T23:59:59.999Z' : 'T00:00:00.000Z') : '';
  }
  if (filters.start && filters.end && filters.start > filters.end) throw new OperationsReadError('日期范围无效');
  for (const key of ['min_amount', 'max_amount']) {
    const value = text(key);
    if (value && (!/^\d{1,12}(\.\d{1,2})?$/.test(value) || !Number.isFinite(Number(value)))) throw new OperationsReadError('金额格式无效');
    filters[key] = value;
  }
  if (filters.min_amount && filters.max_amount && Number(filters.min_amount) > Number(filters.max_amount)) throw new OperationsReadError('金额范围无效');
  return filters;
}

async function checked(query) {
  const result = await query;
  if (result.error) throw new Error('OPERATIONS_READ_FAILED');
  return result;
}
const ledgerColumns = 'id,user_id,transaction_no,business_type,business_id,direction,amount,balance_before,balance_after,currency,status,created_at';
const queueColumns = 'id,order_id,order_item_id,supplier,supplier_product_id,supplier_sku,request_id,attempt_count,status,retryable,provider_order_code,last_error_code,last_attempt_at,completed_at,created_at,updated_at';

function mapAttemptStatusToQueueStatus(status) {
  if (status === 'SUCCEEDED') return 'FULFILLED';
  if (status === 'FAILED') return 'FAILED';
  if (status === 'CLAIMED') return 'PENDING';
  if (status === 'SUBMITTING' || status === 'EXTERNAL_CREATED' || status === 'RECONCILING') return 'PURCHASING';
  return 'UNCERTAIN';
}

export async function readOperationsList(client, kind, params) {
  if (!['ledger', 'supplier-queue'].includes(kind)) throw new OperationsReadError('未知工作台');
  const f = operationsFilters(params);
  const ledger = kind === 'ledger';
  let query = client.from(ledger ? 'balance_transactions' : 'supplier_fulfillment_requests')
    .select(ledger ? ledgerColumns : queueColumns, { count: 'exact' });
  if (f.q) {
    if (ledger) {
      const profiles = await checked(client.from('profiles').select('id').or(`email.ilike.%${f.q}%,display_name.ilike.%${f.q}%`).limit(51));
      if (profiles.data.length > 50) throw new OperationsReadError('匹配用户过多，请缩小搜索范围');
      const ids = profiles.data.map(r => r.id).filter(id => uuid.test(id));
      if (uuid.test(f.q)) ids.push(f.q);
      query = query.or([`transaction_no.ilike.%${f.q}%`, ...(ids.length ? [`user_id.in.(${ids.join(',')})`] : [])].join(','));
    } else {
      const orders = await checked(client.from('orders').select('id').ilike('order_no', `%${f.q}%`).limit(51));
      if (orders.data.length > 50) throw new OperationsReadError('匹配订单过多，请缩小搜索范围');
      const ids = orders.data.map(r => r.id).filter(id => uuid.test(id));
      if (uuid.test(f.q)) ids.push(f.q);
      query = query.or([`request_id.ilike.%${f.q}%`, `provider_order_code.ilike.%${f.q}%`, ...(ids.length ? [`order_id.in.(${ids.join(',')})`] : [])].join(','));
    }
  }
  if (f.status && f.status !== 'all') {
    if (!ledger && ['retryable_failed', 'permanent_failed'].includes(f.status)) {
      query = query.in('status', ['FAILED', 'FAILED_VALIDATION']).eq('retryable', f.status === 'retryable_failed');
    } else if (!ledger) {
      const states = { pending: ['PENDING'], processing: ['PURCHASING','RECONCILIATION'], completed: ['FULFILLED'], uncertain: ['UNCERTAIN'], needs_input: ['NEEDS_INPUT'] };
      if (!states[f.status]) throw new OperationsReadError('队列状态筛选无效');
      query = query.in('status', states[f.status]);
    } else query = query.eq('status', f.status);
  }
  if (ledger) {
    for (const key of ['business_type', 'direction', 'currency']) if (f[key] && f[key] !== 'all') query = query.eq(key, f[key]);
    if (f.min_amount) query = query.gte('amount', f.min_amount);
    if (f.max_amount) query = query.lte('amount', f.max_amount);
  }
  if (f.start) query = query.gte('created_at', f.start);
  if (f.end) query = query.lte('created_at', f.end);
  const offset = (f.page - 1) * f.pageSize;
  const result = await checked(query.order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + f.pageSize - 1));
  let rows = result.data ?? [];
  let totalCount = result.count ?? 0;

  // Supplement with supplier_purchase_attempts if any V1.3 attempts exist without or alongside root requests
  if (!ledger && f.page === 1) {
    try {
      let attemptQuery = client.from('supplier_purchase_attempts')
        .select('id,supplier,logical_request_key,status,external_invoice_id,submit_started_at,submit_finished_at,last_reconciled_at,last_error_code,created_at,updated_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (f.start) attemptQuery = attemptQuery.gte('created_at', f.start);
      if (f.end) attemptQuery = attemptQuery.lte('created_at', f.end);
      const attemptRes = await attemptQuery;
      const attempts = Array.isArray(attemptRes?.data) ? attemptRes.data : [];
      const existingRequestIds = new Set(rows.map(r => r.request_id));
      const extraAttempts = attempts.filter(a => a && a.logical_request_key && !existingRequestIds.has(a.logical_request_key));
      if (extraAttempts.length > 0) {
        const attemptIds = extraAttempts.map(a => a.id);
        const itemsRes = await client.from('supplier_purchase_attempt_items')
          .select('attempt_id,order_item_id,frozen_product_id,frozen_package_id')
          .in('attempt_id', attemptIds);
        const attemptItems = Array.isArray(itemsRes?.data) ? itemsRes.data : [];
        const orderItemIds = [...new Set(attemptItems.map(i => i.order_item_id).filter(Boolean))];
        const orderItemsRes = orderItemIds.length
          ? await client.from('order_items').select('id,order_id').in('id', orderItemIds)
          : { data: [] };
        const orderIdByItemId = new Map((orderItemsRes?.data ?? []).map(i => [i.id, i.order_id]));
        const itemByAttemptId = new Map(attemptItems.map(i => [i.attempt_id, i]));

        for (const a of extraAttempts) {
          const mappedStatus = mapAttemptStatusToQueueStatus(a.status);
          if (f.status && f.status !== 'all') {
            const states = { pending: ['PENDING'], processing: ['PURCHASING','RECONCILIATION'], completed: ['FULFILLED'], uncertain: ['UNCERTAIN'], needs_input: ['NEEDS_INPUT'], retryable_failed: ['FAILED'], permanent_failed: ['FAILED'] };
            if (!(states[f.status] || []).includes(mappedStatus)) continue;
          }
          const item = itemByAttemptId.get(a.id);
          const orderId = item ? (orderIdByItemId.get(item.order_item_id) ?? null) : null;
          if (f.q) {
            const matchKey = String(a.logical_request_key ?? '').toLowerCase().includes(f.q.toLowerCase());
            const matchCode = String(a.external_invoice_id ?? '').toLowerCase().includes(f.q.toLowerCase());
            if (!matchKey && !matchCode) continue;
          }
          rows.push({
            id: a.id,
            order_id: orderId,
            order_item_id: item?.order_item_id ?? null,
            supplier: a.supplier,
            supplier_product_id: item?.frozen_product_id ?? '—',
            supplier_sku: item?.frozen_package_id ?? null,
            request_id: a.logical_request_key,
            attempt_count: 1,
            status: mappedStatus,
            retryable: false,
            provider_order_code: a.external_invoice_id ?? null,
            last_error_code: a.last_error_code ?? null,
            last_attempt_at: a.submit_started_at ?? a.updated_at,
            completed_at: a.status === 'SUCCEEDED' ? (a.submit_finished_at ?? a.updated_at) : null,
            created_at: a.created_at,
            updated_at: a.updated_at,
          });
          totalCount += 1;
        }
        rows.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
      }
    } catch {
      // Ignore optional V1.3 table fallback errors
    }
  }

  const ids = [...new Set(rows.map(r => ledger ? r.user_id : r.order_id).filter(Boolean))];
  const related = ids.length ? await checked(client.from(ledger ? 'profiles' : 'orders').select(ledger ? 'id,email' : 'id,order_no').in('id', ids)) : { data: [] };
  const labels = new Map(related.data.map(r => [r.id, ledger ? r.email : r.order_no]));
  return { rows: rows.map(r => ({ ...r, ...(ledger ? { user_email: labels.get(r.user_id) ?? null } : {
    order_no: labels.get(r.order_id) ?? null,
    last_error_code: r.last_error_code && /^[A-Z0-9_.:-]{1,100}$/i.test(r.last_error_code) ? r.last_error_code : r.last_error_code ? 'REDACTED_ERROR' : null,
  }) })), total: totalCount, page: f.page, pageSize: f.pageSize };
}

export function safeWorkerState(heartbeat, snapshot, now = Date.now()) {
  const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
  const observedAt = date(snapshot?.observed_at);
  const snapshotFresh = observedAt && now - Date.parse(observedAt) >= 0 && now - Date.parse(observedAt) <= 120000;
  const finishedAt = date(heartbeat?.finished_at);
  const status = ['finished','disabled','execute_not_enabled','no_progress','partial_failure'].includes(heartbeat?.status) ? heartbeat.status : 'unavailable';
  return {
    timer_enabled: snapshotFresh && typeof snapshot?.timer_enabled === 'boolean' ? snapshot.timer_enabled : 'unknown',
    timer_active: snapshotFresh && typeof snapshot?.timer_active === 'boolean' ? snapshot.timer_active : 'unknown',
    snapshot_observed_at: observedAt, snapshot_fresh: Boolean(snapshotFresh),
    last_invocation: snapshotFresh && /^[0-9a-f]{32}$/i.test(snapshot?.invocation_id ?? '') ? snapshot.invocation_id : null,
    heartbeat_status: status, heartbeat_finished_at: finishedAt,
    heartbeat_stale: !finishedAt || now - Date.parse(finishedAt) > 180000 || Date.parse(finishedAt) > now + 5000,
    last_successful_run: date(heartbeat?.last_successful_run),
    last_error_observed_at: status === 'partial_failure' ? finishedAt : null,
    error_count: boundedListInteger(heartbeat?.error_count, 0, 0, 100000),
    provider_queries: boundedListInteger(heartbeat?.provider_queries, 0, 0, 100000),
    completed: boundedListInteger(heartbeat?.completed, 0, 0, 100000),
    observability_note: '只读文件观测；未配置或已过期的 systemd 状态显示 unknown，不代表 timer 已关闭。Web 不执行 shell/systemctl。',
  };
}
