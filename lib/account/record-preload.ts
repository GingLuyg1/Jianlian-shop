// Private, tab-memory-only UI cache. Never persist records, tokens or cookies.
// Identity only partitions the cache; the existing APIs remain the authority.
export type RecordKind = "recharges" | "balance";
export type RecordIdentity = { status: "checking" | "anonymous" | "signed-in"; userId: string | null; epoch: number };
export type RecordPage<T = unknown> = { data: T[]; count: number };
type Entry = { value: RecordPage; savedAt: number };
type NamedOrder = { id: string; order_no: string; order_items?: { product_name: string }[] };
const INITIAL: RecordIdentity = { status: "checking", userId: null, epoch: 0 };
const PAGE_TTL = 15_000;
const COUNT_TTL = 60_000;

export class AccountRecordsError extends Error {
  constructor(message: string, public status = 0, public code = "", public requestId = "未生成") { super(message); }
}

export function createAccountRecordPreload(fetcher: typeof fetch = (...args) => fetch(...args), now = Date.now) {
  let identity = INITIAL;
  const listeners = new Set<() => void>();
  const pages = new Map<string, Entry>();
  const hints = new Map<string, { count: number; savedAt: number }>();
  const pending = new Map<string, { controller: AbortController; promise: Promise<RecordPage> }>();
  const orderNames = new Map<string, { value: string; savedAt: number }>();
  let namesSnapshotAt = 0;
  let namesRequest: { controller: AbortController; promise: Promise<void> } | null = null;
  const keyFor = (kind: RecordKind, page: number) => `${kind}:${page}:10`;
  const reset = () => {
    pages.clear(); hints.clear();
    pending.forEach(request => request.controller.abort());
    pending.clear();
    orderNames.clear(); namesSnapshotAt = 0;
    namesRequest?.controller.abort(); namesRequest = null;
  };
  const setUser = (userId: string | null, invalidate = false) => {
    const status = userId ? "signed-in" : "anonymous";
    if (!invalidate && identity.status === status && identity.userId === userId) return false;
    reset();
    identity = { status, userId, epoch: identity.epoch + 1 };
    listeners.forEach(listener => listener());
    return true;
  };
  const peek = <T,>(kind: RecordKind, page: number): RecordPage<T> | null => {
    if (identity.status !== "signed-in") return null;
    const key = keyFor(kind, page), entry = pages.get(key);
    if (!entry || now() - entry.savedAt >= PAGE_TTL) { pages.delete(key); return null; }
    return entry.value as RecordPage<T>;
  };
  const countHint = (kind: RecordKind, page: number) => {
    if (identity.status !== "signed-in") return undefined;
    const key = keyFor(kind, page), hint = hints.get(key);
    // A stale zero must not hide a newly created record while revalidating.
    if (!hint || now() - hint.savedAt >= (hint.count === 0 ? PAGE_TTL : COUNT_TTL)) { hints.delete(key); return undefined; }
    return hint.count;
  };
  const load = <T,>(kind: RecordKind, page: number, force = false): Promise<RecordPage<T>> => {
    if (identity.status !== "signed-in") return Promise.reject(new AccountRecordsError("请先登录", 401));
    if (!Number.isInteger(page) || page < 1) return Promise.reject(new AccountRecordsError("无效页码"));
    const key = keyFor(kind, page);
    const cached = !force && peek<T>(kind, page);
    if (cached) return Promise.resolve(cached);
    const inFlight = pending.get(key);
    if (inFlight && !force) return inFlight.promise as Promise<RecordPage<T>>;
    if (inFlight) { inFlight.controller.abort(); pending.delete(key); }
    const epoch = identity.epoch;
    const controller = new AbortController();
    const isCurrent = () => identity.epoch === epoch && !controller.signal.aborted;
    const promise = (async () => {
      try {
        const path = kind === "recharges" ? "/api/recharges" : "/api/account/balance-transactions";
        const response = await fetcher(`${path}?page=${page}&pageSize=10`, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        const body = await response.json().catch(() => null) as { data?: unknown[]; count?: number; error?: string; code?: string; requestId?: string } | null;
        if (!isCurrent()) throw new AccountRecordsError("记录请求已过期");
        if (!response.ok) {
          if (response.status === 401) setUser(null);
          throw new AccountRecordsError(body?.error ?? "记录读取失败", response.status, body?.code, body?.requestId);
        }
        if (!body || !Array.isArray(body.data) || !Number.isInteger(body.count) || body.count! < 0) throw new AccountRecordsError("记录响应无效");
        const value = { data: body.data, count: body.count! };
        pages.delete(key); pages.set(key, { value, savedAt: now() });
        hints.delete(key); hints.set(key, { count: body.data.length, savedAt: now() });
        while (pages.size > 8) pages.delete(pages.keys().next().value!);
        while (hints.size > 16) hints.delete(hints.keys().next().value!);
        return value;
      } catch (error) {
        if (isCurrent()) { pages.delete(key); hints.delete(key); }
        throw error;
      } finally {
        if (pending.get(key)?.controller === controller) pending.delete(key);
      }
    })();
    pending.set(key, { controller, promise });
    return promise as Promise<RecordPage<T>>;
  };
  // Only names/IDs are shared with the balance view, never order/payment state,
  // amounts or card secrets. Existing auth epochs purge and abort everything.
  const rememberOrderProductNames = (orders: readonly NamedOrder[]) => {
    if (identity.status !== "signed-in") return;
    for (const order of orders) {
      const title = Array.from(new Set((Array.isArray(order.order_items) ? order.order_items : [])
        .map(item => item.product_name).filter(name => typeof name === "string" && name.length > 0))).join("、");
      if (!title) continue;
      for (const id of [order.id, order.order_no]) if (typeof id === "string" && id) {
        orderNames.delete(id); orderNames.set(id, { value: title, savedAt: now() });
      }
    }
    while (orderNames.size > 200) orderNames.delete(orderNames.keys().next().value!);
  };
  const loadOrderProductNames = async (businessIds: string[]): Promise<Record<string, string>> => {
    if (identity.status !== "signed-in") throw new AccountRecordsError("请先登录", 401);
    const ids = Array.from(new Set(businessIds.filter(Boolean)));
    if (!ids.length) return {};
    const epoch = identity.epoch;
    const lookup = () => Object.fromEntries(ids.flatMap(id => {
      const entry = orderNames.get(id);
      return entry && now() - entry.savedAt < PAGE_TTL ? [[id, entry.value]] : [];
    }));
    if (Object.keys(lookup()).length === ids.length || (namesSnapshotAt > 0 && now() - namesSnapshotAt < PAGE_TTL)) return lookup();
    if (!namesRequest) {
      const controller = new AbortController();
      const request = { controller, promise: Promise.resolve() };
      namesRequest = request;
      request.promise = Promise.resolve().then(async () => {
        try {
          const response = await fetcher("/api/orders?page=1&pageSize=100", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
          const body = await response.json().catch(() => null) as { orders?: NamedOrder[]; error?: string } | null;
          if (identity.epoch !== epoch || controller.signal.aborted) throw new AccountRecordsError("记录请求已过期");
          if (!response.ok) {
            if (response.status === 401) setUser(null);
            throw new AccountRecordsError(body?.error ?? "商品名称暂不可用", response.status);
          }
          if (!body || !Array.isArray(body.orders)) throw new AccountRecordsError("订单响应无效");
          rememberOrderProductNames(body.orders);
          namesSnapshotAt = now();
        } finally { if (namesRequest === request) namesRequest = null; }
      });
    }
    await namesRequest.promise;
    if (identity.epoch !== epoch) throw new AccountRecordsError("记录请求已过期");
    return lookup();
  };
  return {
    setUser, peek, load, countHint, rememberOrderProductNames, loadOrderProductNames,
    getSnapshot: () => identity,
    getServerSnapshot: () => INITIAL,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

export const accountRecordPreload = createAccountRecordPreload();

export function scheduleRechargeRecordsPrefetch() {
  if (typeof window === "undefined") return;
  const epoch = accountRecordPreload.getSnapshot().epoch;
  const run = () => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (document.visibilityState !== "visible" || connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? "")) return;
    const current = accountRecordPreload.getSnapshot();
    if (current.status === "signed-in" && current.epoch === epoch) void accountRecordPreload.load("recharges", 1).catch(() => undefined);
  };
  // No await inside the auth callback. One optional first-page GET, deduped
  // with actual navigation; balance history is deliberately not prefetched.
  if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 1200 });
  else window.setTimeout(run, 0);
}
