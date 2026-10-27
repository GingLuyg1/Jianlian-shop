import "server-only";

export type OrderScanWindow = {
  id: string; created_at: string; expires_at: string; last_scanned_block: string | null;
};
type PlannedWindow = { id: string; from: bigint; to: bigint; complete: boolean };
type BlockReader = (block: bigint) => Promise<{ timestamp: number; hash: string }>;

// Search actual header timestamps, not an assumed BSC block rate. Every new
// order gets its own durable progress: insertion during a previous scan cannot
// be hidden by a shared high-water mark.
export async function planOrderScanRanges(windows: OrderScanWindow[], finalized: bigint, read: BlockReader) {
  if (windows.length > 1000) throw Error("ORDER_SCAN_WINDOW_LIMIT");
  const end = await read(finalized);
  const lowerBound = async (time: number) => {
    // Bracket near the current head first. A new order must not depend on
    // querying headers halfway back to genesis on a free recent-data provider.
    let lo = finalized, hi = finalized + BigInt(1), distance = BigInt(1);
    while (lo > BigInt(0) && (await read(lo)).timestamp >= time) {
      hi = lo;
      lo = finalized > distance ? finalized - distance : BigInt(0);
      distance *= BigInt(2);
      if (finalized - lo > BigInt(1_000_000)) throw Error("ORDER_SCAN_HISTORY_BOUND_EXCEEDED");
    }
    if ((await read(lo)).timestamp >= time) return lo;
    lo += BigInt(1);
    while (lo < hi) {
      const mid = (lo + hi) / BigInt(2);
      if ((await read(mid)).timestamp < time) lo = mid + BigInt(1); else hi = mid;
    }
    return lo;
  };
  const planned: PlannedWindow[] = [];
  for (const window of windows) {
    const start = Date.parse(window.created_at), expiry = Date.parse(window.expires_at);
    if (!Number.isFinite(start) || !Number.isFinite(expiry) || expiry - start !== 900_000) throw Error("ORDER_SCAN_WINDOW_INVALID");
    const from = window.last_scanned_block === null ? await lowerBound(Math.floor(start / 1000)) : BigInt(window.last_scanned_block) + BigInt(1);
    const complete = end.timestamp > expiry / 1000;
    // Include one confirmed boundary strictly after expiry, then retire the
    // window. Late logs are rejected by the database's timestamp guard.
    const to = complete ? await lowerBound(Math.floor(expiry / 1000) + 1) : finalized;
    if (from <= to) planned.push({ id: window.id, from, to, complete });
  }
  planned.sort((a, b) => a.from < b.from ? -1 : a.from > b.from ? 1 : 0);
  const merged: { from: bigint; to: bigint; windows: PlannedWindow[] }[] = [];
  for (const window of planned) {
    const previous = merged[merged.length - 1];
    if (previous && window.from <= previous.to + BigInt(1)) {
      if (window.to > previous.to) previous.to = window.to;
      previous.windows.push(window);
    } else merged.push({ from: window.from, to: window.to, windows: [window] });
  }
  return merged;
}
