import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import { read, extractFunction, createSignature, releaseSignature } from "./kuajingzy-atomic-cap-patch.mjs";

assert.equal(process.env.KJ_PGHOST, "127.0.0.1");
assert.equal(process.env.KJ_PGDATABASE, "kuajingzy_freeze_isolated");
const port = process.env.KJ_PGPORT ?? "5432";
assert(["5432", "55441"].includes(port));
const psql = process.env.KJ_PSQL ?? "psql";
const args = ["-X", "-w", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", port,
  "-U", process.env.KJ_PGUSER ?? "postgres", "-d", "kuajingzy_freeze_isolated", "-Atq"];
const options = { encoding: "utf8", timeout: 20000, windowsHide: true,
  env: { ...process.env, PGOPTIONS: "-c statement_timeout=15000 -c lock_timeout=10000" } };
export function query(sql, allowFailure = false) {
  const result = spawnSync(psql, args, { ...options, input: sql });
  if (allowFailure) return result;
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.replaceAll("\r\n", "\n").trim();
}
export function connection() {
  return spawn(psql, args, { ...options, stdio: ["pipe", "pipe", "pipe"] });
}
export const definition = signature => query("select pg_get_functiondef('" + signature + "'::regprocedure)");
export function bootstrap() {
  assert.equal(query("select current_setting('server_version_num')::int / 10000"), "17");
  query(read("tests/fixtures/kuajingzy-order-create-support.sql"));
  query(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
    end $$;
    alter table orders add reservation_released_at timestamptz, add updated_at timestamptz,
      add cancelled_at timestamptz, add expired_at timestamptz, add created_at timestamptz default now();
    alter table products add updated_at timestamptz;
    alter table digital_inventory add delivered_at timestamptz, add delivered_order_id uuid, add updated_at timestamptz;
    create table order_deliveries(order_item_id uuid,delivery_status text);
    create table payment_sessions(business_type text,business_id uuid,status text,closed_at timestamptz,updated_at timestamptz);
    create table chain_payment_sessions(order_id uuid,status text,submitted_tx_hash text,manual_review_decision text,
      failure_reason text,updated_at timestamptz);
    create table chain_transaction_claims(order_id uuid);
    create table chain_transactions(order_id uuid);
    create function auth.role() returns text language sql as $$ select 'service_role'::text $$;
    create function public.is_admin(uuid) returns boolean language sql as $$ select false $$;
  `);
  query(read("tests/fixtures/kuajingzy-order-create-base.sql"));
  query(read("supabase/migrations/20261117184700_kuajingzy_order_binding_freeze_v1.sql"));
  // Last unconditional release definition in the repository migration chain.
  query(extractFunction("supabase/migrations/20260710_order_lifecycle_compatibility_baseline.sql", "release_order_inventory"));
  query(extractFunction("supabase/migrations/20260727_bep20_automatic_overpayment_settlement.sql", "cancel_unpaid_order"));
  query(extractFunction("supabase/migrations/20260724_order_expiration_chain_session_consistency.sql", "expire_unpaid_order"));
  query(`
    revoke all on function ${createSignature} from public, anon;
    grant execute on function ${createSignature} to authenticated, service_role;
    revoke all on function ${releaseSignature} from public, anon, authenticated;
    grant execute on function ${releaseSignature} to service_role;
  `);
}
