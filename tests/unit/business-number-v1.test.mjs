import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { randomInt, randomUUID } from "node:crypto";
import ts from "typescript";
import { loadPureTypeScript } from "../helpers/load-pure-typescript.mjs";

// Execute the actual private route functions; no network, provider, or database.
function routeParts(random = randomInt) {
  const file = new URL("../../app/api/recharges/route.ts", import.meta.url);
  const code = ts.transpileModule(readFileSync(file, "utf8") +
    "\nexport { generateRechargeNo, insertRecharge };", {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(name => {
    if (name === "node:crypto") return { randomInt: random, randomUUID };
    if (name === "@/lib/payments/recharge-utils") return { getPaymentErrorMessage: (e, fallback) => e?.message ?? fallback };
    if (name === "@/lib/recharges/status-machine") return { parseRechargeStatusStrict: s => s === "pending" ? s : null };
    return {};
  }, module, module.exports);
  return module.exports;
}

const input = (request = "synthetic-request") => ({
  rechargeId: null, createdAt: null, expiresAt: "2026-11-07T08:10:00Z",
  userId: "synthetic-user", userEmail: "fixture@example.test", amount: 1,
  fee: 0, payableAmount: 1, clientRequestId: request, customerNote: "", rateSnapshot: null,
  channel: { code: "alipay", provider: "snpay", name: "fixture", currency: "CNY", reviewMode: "provider" },
});
const collision = { code: "23505", message: 'duplicate key value violates unique constraint "account_recharges_recharge_no_key"' };
function database(rows = [], fail) {
  let attempts = 0;
  return { rows, get attempts() { return attempts; }, from(table) {
    assert.equal(table, "account_recharges");
    const predicates = [];
    const q = {
      async insert(row) {
        attempts++;
        const error = fail?.(row, attempts, rows);
        if (error) return { error };
        if (rows.some(r => r.recharge_no === row.recharge_no)) return { error: collision };
        if (rows.some(r => r.user_id === row.user_id && r.client_request_id === row.client_request_id)) {
          return { error: { code: "23505", constraint: "account_recharges_user_client_request_unique" } };
        }
        rows.push({ ...row }); return { error: null };
      },
      select() { return q; }, eq(k, v) { predicates.push(r => r[k] === v); return q; },
      in(k, v) { predicates.push(r => v.includes(r[k])); return q; },
      order() { return q; }, limit() { return q; },
      async maybeSingle() { return { data: rows.find(r => predicates.every(p => p(r))) ?? null, error: null }; },
    };
    return q;
  } };
}

test("CZ uses Shanghai calendar date, six padded base36 symbols and secure randomInt bounds", () => {
  const bounds = []; const numbers = [0, 36 ** 6 - 1];
  const { generateRechargeNo } = routeParts(max => { bounds.push(max); return numbers.shift(); });
  assert.equal(generateRechargeNo(new Date("2026-11-07T15:59:59Z")), "CZ20261107000000");
  assert.equal(generateRechargeNo(new Date("2026-11-07T16:00:00Z")), "CZ20261108ZZZZZZ");
  assert.deepEqual(bounds, [36 ** 6, 36 ** 6]);
});

test("two concurrent new requests preserve independent canonical IDs", async () => {
  let n = 0; const { insertRecharge } = routeParts(() => n++); const db = database();
  const values = await Promise.all([insertRecharge(db, input("a")), insertRecharge(db, input("b"))]);
  assert.equal(new Set(values).size, 2); assert.equal(db.rows.length, 2);
  values.forEach(v => assert.match(v, /^CZ\d{8}[A-Z0-9]{6}$/));
});

test("authoritative number collision retries with a fresh number and unchanged request", async () => {
  let n = 0; const { insertRecharge } = routeParts(() => n++);
  const db = database([], (_, attempt) => attempt === 1 ? collision : null);
  const number = await insertRecharge(db, input());
  assert.equal(db.attempts, 2); assert.match(number, /000001$/);
  assert.equal(db.rows[0].client_request_id, input().clientRequestId);
});

test("persistent canonical collision stops at four attempts", async () => {
  const { insertRecharge } = routeParts(() => 0); const db = database([], () => collision);
  await assert.rejects(insertRecharge(db, input()), e => e === collision);
  assert.equal(db.attempts, 4); assert.equal(db.rows.length, 0);
});

test("idempotency-key race returns the original historical number without a second insert", async () => {
  const old = { ...input(), user_id: input().userId, client_request_id: input().clientRequestId,
    recharge_no: "RC202611030955503Y3KI6", status: "pending", amount: 1, requested_amount: 1 };
  const db = database([], (_, __, rows) => { rows.push(old); return { code: "23505", constraint: "account_recharges_user_client_request_unique" }; });
  assert.equal(await routeParts(() => 1).insertRecharge(db, input()), old.recharge_no);
  assert.equal(db.attempts, 1); assert.equal(db.rows.length, 1);
});

for (const error of [{ code: "23505", constraint: "account_recharges_pkey" },
  { code: "23505" }, { code: "08006" }, { code: "57014" }]) {
  test(`non-number conflict or uncertain ${error.constraint ?? error.code} never regenerates`, async () => {
    const db = database([], () => error);
    await assert.rejects(routeParts(() => 0).insertRecharge(db, input()), e => e === error);
    assert.equal(db.attempts, 1); assert.equal(db.rows.length, 0);
  });
}

test("new CZ is visible in full; legacy display and canonical copy/payment references remain intact", () => {
  const { rechargeDisplayNumber } = loadPureTypeScript(new URL("../../lib/account/record-presentation.ts", import.meta.url));
  assert.equal(rechargeDisplayNumber("CZ20261107A1B2C3"), "CZ20261107A1B2C3");
  assert.match(rechargeDisplayNumber("RC202611030955503Y3KI6"), /^\d{6}$/);
  const page = readFileSync(new URL("../../components/account/AccountRechargeContent.tsx", import.meta.url), "utf8");
  assert.match(page, /copyRechargeNo\(record\.rechargeNo\)/);
  assert.match(page, /完整订单编号：\$\{record\.rechargeNo\}/);
});
