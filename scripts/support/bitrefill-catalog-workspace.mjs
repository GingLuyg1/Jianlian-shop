// Explicit loopback-only metadata workspace. No Supabase or payment client.
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { listenMock, closeMock, readMockJson, mockJson } from "./bitrefill-mock-supplier.mjs";
import { createLocalBitrefillMappingService } from "../../lib/providers/bitrefill/local-mapping.mjs";
import { projectBitrefillAftercare } from "../../lib/admin/bitrefill-aftercare.mjs";
export async function createCatalogWorkspace({ backend, catalog, renderHtml }) {
  const mapping = createLocalBitrefillMappingService({ backend, catalog });
  const session = randomBytes(32).toString("hex"), cookieName = "jianlian_local_catalog_v4";
  let origin;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, origin);
      if (request.headers.host !== new URL(origin).host || request.headers["sec-fetch-site"] === "cross-site" ||
        request.headers.origin && request.headers.origin !== origin) return mockJson(response, 403, { error: "LOCAL_ORIGIN_REQUIRED" });
      if (request.method === "GET" && ["/", "/admin/suppliers/bitrefill/aftercare"].includes(url.pathname)) {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
          "Set-Cookie": `${cookieName}=${session}; HttpOnly; SameSite=Strict; Path=/`, "X-Frame-Options": "DENY" });
        response.end(await renderHtml(url.pathname === "/" ? "catalog" : "aftercare")); return;
      }
      const cookies = String(request.headers.cookie ?? "").split(";").map((s) => s.trim());
      if (!cookies.includes(`${cookieName}=${session}`)) return mockJson(response, 401, { error: "LOCAL_SESSION_REQUIRED" });
      if (request.method === "POST" && (request.headers.origin !== origin || request.headers["x-jianlian-local-workspace"] !== "v4")) {
        return mockJson(response, 403, { error: "LOCAL_WRITE_ORIGIN_REQUIRED" });
      }
      const base = "/api/admin/suppliers/bitrefill";
      if (request.method === "GET" && url.pathname === `${base}/catalog`) {
        const result = url.searchParams.has("productId") ? await catalog.detail(url.searchParams.get("productId")) : await catalog.list(Object.fromEntries(url.searchParams));
        return mockJson(response, 200, result);
      }
      if (request.method === "GET" && url.pathname === `${base}/mappings`) return mockJson(response, 200, await mapping.list());
      if (request.method === "GET" && url.pathname === `${base}/aftercare`) {
        const s = await backend.read();
        return mockJson(response, 200, { cases: projectBitrefillAftercare({ roots: s.supplier_fulfillment_requests ?? [],
          units: s.supplier_purchase_attempt_items ?? [], attempts: s.supplier_purchase_attempts ?? [],
          children: s.supplier_external_orders ?? [], orders: s.orders ?? [] }), notes: s.aftercareNotes ?? [],
          localOnly: true, hasMore: false, page: 1, automaticCustomerRefund: false });
      }
      if (request.method === "POST") {
        const input = await readMockJson(request);
        if (url.pathname === `${base}/mappings`) return mockJson(response, 200, await mapping.save(input, "local-admin"));
        if (url.pathname === `${base}/local-skus`) return mockJson(response, 201, await mapping.addSku(input, "local-admin"));
        if (url.pathname === `${base}/aftercare-notes`) {
          const s = await backend.read();
          const cases = projectBitrefillAftercare({ roots: s.supplier_fulfillment_requests ?? [], units: s.supplier_purchase_attempt_items ?? [],
            attempts: s.supplier_purchase_attempts ?? [], children: s.supplier_external_orders ?? [], orders: s.orders ?? [] });
          if (!cases.some((c) => c.id === input.caseId)) throw new Error("AFTERCARE_CASE_NOT_FOUND");
          return mockJson(response, 200, await mapping.annotateCase(input, "local-admin"));
        }
      }
      return mockJson(response, 404, { error: "LOCAL_METADATA_ROUTE_ONLY" });
    } catch (error) {
      const code = /^[A-Z0-9_]{1,90}$/.test(error?.message ?? "") ? error.message : "LOCAL_METADATA_REJECTED";
      mockJson(response, 409, { error: code });
    }
  });
  origin = await listenMock(server);
  return { origin, mapping, close: () => closeMock(server) };
}
