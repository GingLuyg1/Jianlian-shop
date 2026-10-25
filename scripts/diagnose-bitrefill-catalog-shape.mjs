// Exactly one authorized public-catalog GET, no retry, no raw payload retained.
import { parseBitrefillProduct } from "../lib/providers/bitrefill/protocol.mjs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function readCatalogDiagnosticBody(response) {
  const maxBytes = 512 * 1024;
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    void response.body?.cancel().catch(() => {});
    throw new Error("BODY_TOO_LARGE");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("BODY_STREAM_REQUIRED");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new Error("BODY_TOO_LARGE");
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}

async function main() {
  if (!process.argv.includes("--one-page") || !process.env.BITREFILL_API_KEY || process.env.NODE_DEBUG || process.env.NODE_DEBUG_NATIVE) {
    process.exitCode = 2; return;
  }
  try {
  const response = await fetch("https://api.bitrefill.com/v2/products?country=US&start=50&limit=50", {
    method: "GET", headers: { Accept: "application/json", Authorization: `Bearer ${process.env.BITREFILL_API_KEY}` },
    redirect: "error", signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("HTTP_REJECTED_STOP");
  const body = await readCatalogDiagnosticBody(response);
  if (!Array.isArray(body.data) || body.data.length > 50) throw new Error("LIST_SHAPE_REJECTED");
  const safe = (v) => typeof v === "string" && v.length <= 100 && !/[<>\u0000-\u001f]/.test(v) ? v : null;
  const failed = body.data.filter((p) => !parseBitrefillProduct(p)).map((p) => ({
    id: safe(p.id), name: safe(p.name), stockType: typeof p.in_stock,
    baseParses: Boolean(parseBitrefillProduct({ ...p, packages: [], range: undefined })),
    rangeParses: Boolean(parseBitrefillProduct({ ...p, packages: [] })),
    packageCount: Array.isArray(p.packages) ? p.packages.length : null,
    invalidPackages: (Array.isArray(p.packages) ? p.packages : []).filter((x) =>
      !parseBitrefillProduct({ ...p, packages: [x], range: undefined })).map((x) => ({
      packageId: safe(x.package_id ?? x.id), value: typeof x.value === "number" ? x.value : safe(x.value),
      valueType: typeof x.value, priceType: typeof x.price,
    })).slice(0, 5),
  }));
  const evidence = { utc: new Date().toISOString(), method: "GET", endpoint: "US_catalog_start_50",
    httpStatus: response.status, records: body.data.length, failed };
  const path = `D:/Jianlian/_bitrefill_launch_connect_v1_20261025/shape-${Date.now()}.json`;
  await writeFile(path, JSON.stringify(evidence, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ evidence: path, invalidProducts: failed.length }));
  } catch { console.log('{"error":"ONE_PAGE_DIAGNOSTIC_STOP"}'); process.exitCode = 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch(() => { console.log('{"error":"ONE_PAGE_DIAGNOSTIC_STOP"}'); process.exitCode = 1; });
}
