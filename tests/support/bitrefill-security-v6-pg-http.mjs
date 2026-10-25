// Actual Next Route Handlers and authorization code, backed by the disposable
// database. This small SQL query adapter is a fixture, NOT a PostgREST server.
import assert from "node:assert/strict";
import { loadSecurityTs, nextJson } from "./bitrefill-security-v6-fixture.mjs";
import * as visibility from "../../lib/catalog/effective-category-visibility.mjs";

export async function runSecurityV6HttpChecks({ sql, literal, ids }) {
  let currentUser = null, serviceCalls = 0, rpcCalls = 0;
  const checks = [];
  const check = (name, value) => { assert.ok(value, name); checks.push(name); };
  const identifier = (value) => { assert.match(value, /^[a-z_]+$/); return `"${value}"`; };
  function client(service = false) {
    const user = currentUser, role = service ? "service_role" : user ? "authenticated" : "anon";
    return {
      auth: { getUser: async () => ({ data: { user: user ? { id: user } : null }, error: null }) },
      from(table) {
        identifier(table);
        let fields = "*", limit = null, offset = 0, count = false;
        const filters = [], sorting = [];
        const q = {
          select(value, options) { fields = value; count = options?.count === "exact"; return q; },
          eq(key, value) { filters.push(`r.${identifier(key)} = ${literal(value)}`); return q; },
          in(key, values) { filters.push(`r.${identifier(key)} in (${values.map(literal).join(",")})`); return q; },
          limit(n) { limit = n; return q; },
          order(key, options) { sorting.push(`r.${identifier(key)} ${options?.ascending === false ? "desc" : "asc"}`); return q; },
          range(start, end) { offset = start; limit = end - start + 1; return q; },
          maybeSingle: () => execute(true),
          then: (ok, fail) => execute(false).then(ok, fail),
        };
        async function execute(single) {
          try {
            const relation = fields.match(/,?orders\(([^)]+)\)/);
            const rootFields = fields.replace(/,?orders\([^)]+\)/, "");
            let projection = rootFields === "*" ? "r.*" : rootFields.split(",").map((f) => `r.${identifier(f)}`).join(",");
            if (relation) {
              assert.equal(table, "refund_requests");
              const columns = relation[1].split(",").map((f) => `o.${identifier(f)}`).join(",");
              projection += `,(select to_jsonb(linked) from (select ${columns} from public.orders o where o.id=r.order_id) linked) as orders`;
            }
            const where = filters.length ? `where ${filters.join(" and ")}` : "";
            const sort = sorting.length ? `order by ${sorting.join(",")}` : "";
            const paging = `${limit === null ? "" : `limit ${limit}`} offset ${offset}`;
            const query = `select coalesce(jsonb_agg(to_jsonb(selected)), '[]'::jsonb) from (select ${projection} from public.${identifier(table)} r ${where} ${sort} ${paging}) selected`;
            const rows = JSON.parse(await sql(query, role, user));
            const total = count ? Number(await sql(`select count(*) from public.${identifier(table)} r ${where}`, role, user)) : null;
            return { data: single ? rows[0] ?? null : rows, error: null, count: total };
          } catch (e) { return { data: null, error: { code: e.sqlstate ?? "SYNTHETIC_QUERY_FAILED", message: "Synthetic query failed" } }; }
        }
        return q;
      },
      async rpc(name, args) {
        rpcCalls++;
        assert.equal(name, "super_admin_process_refund_request");
        const keys = ["p_refund_id", "p_action", "p_approved_amount", "p_review_note", "p_user_visible_note", "p_provider_refund_id", "p_request_id"];
        try { return { data: JSON.parse(await sql(`select public.${name}(${keys.map((k) => literal(args[k] ?? null)).join(",")})`, role, user)), error: null }; }
        catch (e) { return { data: null, error: { code: e.sqlstate, message: "Synthetic RPC denied" } }; }
      },
    };
  }
  const server = { hasSupabaseServerConfig: () => true, getSupabaseServerClient: () => client() };
  const services = { getSupabaseServiceRoleClient: () => { serviceCalls++; return client(true); } };
  const audit = { writeAdminAuditLog: async () => ({ ok: true }) };
  const crypto = await import("node:crypto");
  const authorization = await loadSecurityTs("lib/auth/require-admin.ts", { "@/lib/supabase/server": server });
  const shared = await loadSecurityTs("app/api/admin/catalog/_shared.ts", {
    "next/server": nextJson, "@/lib/admin/audit-log-service": audit, "@/lib/auth/require-admin": authorization,
  });
  const adminProduct = await loadSecurityTs("app/api/admin/catalog/products/[productId]/route.ts", {
    crypto, "../../_shared": shared, "@/lib/supabase/service-role": services,
    "@/lib/cache/cache-tags": {}, "@/lib/media/media-service": {}, "@/lib/security/rate-limit": {},
  });
  const publicCatalog = await loadSecurityTs("lib/supabase/public-catalog.ts", {
    "@/lib/supabase/client": {}, "@/lib/catalog/effective-category-visibility.mjs": visibility,
  });
  const detail = await loadSecurityTs("app/api/catalog/products/[identifier]/route.ts", {
    crypto, "next/server": nextJson, "@/lib/supabase/public-catalog": publicCatalog,
    "@/lib/supabase/server": server, "@/lib/supabase/service-role": services,
    "@/lib/catalog/effective-category-visibility.mjs": visibility,
  });
  const refundUtils = { normalizeRefundError: (v) => v, REFUND_ACTION_LABELS: { mark_processing: "MOCK manual review" } };
  const refunds = await loadSecurityTs("app/api/refunds/route.ts", {
    "next/server": nextJson, "@/lib/refunds/refund-utils": refundUtils, "@/lib/supabase/server": server,
  });
  const apiAuth = await loadSecurityTs("lib/admin/api-auth.ts", { "server-only": {}, crypto, "next/server": nextJson, "@/lib/supabase/server": server });
  const adminRefund = await loadSecurityTs("app/api/admin/refunds/[refundId]/route.ts", {
    "next/server": nextJson, "@/lib/admin/api-auth": apiAuth, "@/lib/admin/audit-log-service": audit,
    "@/lib/refunds/refund-utils": refundUtils, "@/lib/supabase/service-role": services,
  });
  const request = (path) => new Request(`http://127.0.0.1${path}`);
  for (const user of [null, ids.user]) {
    currentUser = user;
    const response = await detail.GET(request(`/api/catalog/products/${ids.product}`), { params: { identifier: ids.product } });
    check(`${user ? "customer" : "anon"}_actual_public_detail_200`, response.status === 200);
    const body = await response.json();
    check(`${user ? "customer" : "anon"}_actual_detail_no_private_metadata`, body.data.product.metadata === null && body.data.skus.every((s) => s.metadata === null) && !JSON.stringify(body).includes("supplier_cost"));
    const beforeCalls = serviceCalls;
    const denied = await adminProduct.GET(request(`/api/admin/products/${ids.product}`), { params: { productId: ids.product } });
    check(`${user ? "customer" : "anon"}_admin_endpoint_denied_before_service`, denied.status === (user ? 403 : 401) && beforeCalls === serviceCalls);
  }
  for (const user of [ids.ordinaryAdmin, ids.admin]) {
    currentUser = user;
    const response = await adminProduct.GET(request(`/api/admin/products/${ids.product}`), { params: { productId: ids.product } });
    const body = await response.json();
    check(`${user === ids.admin ? "super_admin" : "admin"}_actual_product_endpoint_private_metadata`, response.status === 200 && body.product.metadata.supplier === "daju" && body.product.metadata.supplier_binding_candidate.supplier_cost === "4.12");
  }
  currentUser = ids.user;
  const history = await refunds.GET(request("/api/refunds?pageSize=50")), historyBody = await history.json();
  check("actual_customer_history_owner_scoped", history.status === 200 && historyBody.refunds.length === 2 && historyBody.refunds.every((r) => r.orderNo !== "MOCK-V6-OTHER"));
  const refundId = await sql("select id from refund_requests where client_request_id='MOCK-V6-EXTERNAL'");
  const context = { params: { refundId } };
  const patchRequest = () => new Request("http://127.0.0.1/api/admin/refunds/mock", { method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "mark_processing", reviewNote: "MOCK manual review only", requestId: "MOCK-HTTP-V6" }) });
  for (const user of [null, ids.user, ids.ordinaryAdmin]) {
    currentUser = user; const beforeRpc = rpcCalls;
    const denied = await adminRefund.PATCH(patchRequest(), context);
    check(`actual_manual_refund_denies_${user ?? "anon"}`, denied.status === (user ? 403 : 401) && rpcCalls === beforeRpc);
  }
  currentUser = ids.admin;
  const manual = await adminRefund.PATCH(patchRequest(), context);
  check("actual_super_admin_manual_processing_preserved", manual.status === 200 && (await manual.json()).result.status === "processing");
  const before = await sql("select count(*) from refund_requests"), beforeRpc = rpcCalls;
  for (const user of [null, ids.user, ids.admin]) {
    currentUser = user;
    check(`actual_self_service_closed_${user ?? "anon"}`, (await refunds.POST()).status === 410);
  }
  check("closed_endpoint_no_rpc_or_new_refunds", before === await sql("select count(*) from refund_requests") && rpcCalls === beforeRpc);
  return { checks };
}
