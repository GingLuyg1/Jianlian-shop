import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const origin = "http://127.0.0.1:3001";
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const deliveryPath = "/api/internal/orders/delivery-recovery";
const costSyncPath = "/api/internal/bitrefill-cost-sync";

export async function runMaintenanceJob(job, {
  env = process.env,
  check = false,
  fetchImpl = fetch,
  storage = { readFile, rename, writeFile },
} = {}) {
  if (job !== "delivery-recovery" && job !== "bitrefill-cost-sync") throw new Error("UNKNOWN_JOB");

  const release = env.JIANLIAN_RELEASE_DIR?.match(/^\/www\/releases\/jianlian-shop-([a-f0-9]{40})$/)?.[1];
  if (!release) throw new Error("INVALID_RELEASE_PIN");
  const secret = (job === "delivery-recovery"
    ? env.INTERNAL_DELIVERY_RECOVERY_SECRET : env.BITREFILL_COST_SYNC_JOB_SECRET)?.trim();
  if (!secret) throw new Error("JOB_CREDENTIAL_MISSING");

  const health = await fetchImpl(origin + "/api/health", {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!health.ok || (await health.json()).commit_sha !== release.slice(0, 12)) {
    throw new Error("RUNTIME_RELEASE_MISMATCH");
  }

  async function call(endpoint, method, json) {
    const response = await fetchImpl(origin + endpoint, {
      method,
      headers: { authorization: "Bearer " + secret, ...(json ? { "content-type": "application/json" } : {}) },
      body: json ? JSON.stringify(json) : undefined,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(job === "delivery-recovery" ? 55_000 : 150_000),
    });
    if (!response.ok) throw new Error("INTERNAL_JOB_HTTP_" + response.status);
    return response.json();
  }

  if (job === "bitrefill-cost-sync") {
    const report = await call(costSyncPath, check ? "GET" : "POST");
    if (!report.ok || report.mode !== (check ? "dry_run" : "apply")) throw new Error("UNEXPECTED_COST_SYNC_RESULT");
    return { checked: check, mode: report.mode };
  }

  const state = env.STATE_DIRECTORY;
  if (!check && state !== "/var/lib/jianlian-maintenance-delivery-recovery") {
    throw new Error("INVALID_DELIVERY_STATE_DIRECTORY");
  }
  const cursorFile = state ? path.join(state, "cursor") : null;
  let cursor = "";
  if (!check && cursorFile) {
    try {
      cursor = (await storage.readFile(cursorFile, "utf8")).trim();
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (cursor && !uuid.test(cursor)) throw new Error("INVALID_DELIVERY_CURSOR");
  }
  const batch = await call(deliveryPath + (cursor ? "?after=" + cursor : ""), "GET");
  const ids = batch.orderIds;
  if (!Array.isArray(ids) || ids.length > 2 || ids.some((id) => !uuid.test(id)) ||
      new Set(ids).size !== ids.length || (ids.length === 2 ? batch.nextCursor !== ids[1] : batch.nextCursor !== null)) {
    throw new Error("INVALID_DELIVERY_CANDIDATE_BATCH");
  }
  if (check) return { checked: true, candidates: ids.length };

  let processed = 0;
  let failures = 0;
  for (const orderId of ids) {
    try {
      await call(deliveryPath, "POST", { orderId });
      processed++;
    } catch {
      failures++;
    }
  }
  await storage.writeFile(cursorFile + ".new", (batch.nextCursor ?? "") + "\n", { mode: 0o600 });
  await storage.rename(cursorFile + ".new", cursorFile);
  return { checked: false, candidates: ids.length, processed, failures };
}
