import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((name) => {
    if (name === "server-only") return {};
    if (name in dependencies) return dependencies[name];
    if (name === "node:crypto") return require(name);
    throw Error("UNEXPECTED_DEPENDENCY");
  }, module, module.exports);
  return module.exports;
}
const api = load("lib/recharges/bep20-scanner-rpc.ts");
const options = { url: "https://rpc-bsc.blockmachine.io", apiKey: "synthetic-test-only-key" };
const reply = (result = "0x38", status = 200, error, headers = {}) => new Response(
  JSON.stringify({ jsonrpc: "2.0", id: 1, ...(error ? { error: { code: error, message: "provider-secret-not-retained" } } : { result }) }),
  { status, headers },
);
function harness(responder = () => reply()) {
  let clock = 1000;
  const calls = [];
  const request = api.createScannerRpcTransport({
    now: () => clock, sleep: async (ms) => { clock += ms; }, timeoutMs: 40,
    fetch: async (url, init) => { calls.push({ url, init, at: clock }); return responder(url, init, calls.length); },
  });
  return { request, calls, advance: (ms) => { clock += ms; } };
}
const rejects = (promise, code) => assert.rejects(promise, (e) => {
  assert.equal(e.code, code);
  assert.doesNotMatch(JSON.stringify(e) + e.stack, /synthetic-test-only-key|provider-secret-not-retained/);
  return true;
});

test("Bearer credential is server-only, not URL/body, and redirects are refused", async () => {
  const h = harness();
  assert.equal(await h.request(options, "eth_chainId", []), "0x38");
  const { url, init } = h.calls[0];
  assert.equal(url, options.url);
  assert.equal(init.headers.Authorization, `Bearer ${options.apiKey}`);
  assert.equal(init.redirect, "error");
  assert.equal(init.cache, "no-store");
  assert.doesNotMatch(init.body, /synthetic-test-only-key/);
  assert.ok(init.signal instanceof AbortSignal);
});
test("real loopback HTTP exercises synthetic Bearer/body transport without contacting provider", async () => {
  let received = 0;
  const server = http.createServer(async (req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${options.apiKey}`);
    assert.equal(req.url, "/");
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(body.method, "eth_getLogs");
    assert.equal(body.params[0].fromBlock, "0x65");
    received++;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: [] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const local = `http://127.0.0.1:${server.address().port}`;
    const request = api.createScannerRpcTransport({ timeoutMs: 2000, fetch: (url, init) => {
      assert.equal(url, options.url); return fetch(local, init);
    } });
    assert.deepEqual(await request(options, "eth_getLogs", [{ fromBlock: "0x65", toBlock: "0x96" }]), []);
    assert.equal(received, 1);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
for (const url of ["http://rpc-bsc.blockmachine.io", "https://rpc-bsc.blockmachine.io.evil.invalid", "https://rpc-bsc.blockmachine.io:8443", "https://rpc-bsc.blockmachine.io/extra", "https://rpc-bsc.blockmachine.io?authorization=x", "https://a:b@rpc-bsc.blockmachine.io", "https://rpc-bsc.blockmachine.io/#fragment"]) {
  test(`credential destination guard ${url.replace(/a:b@/, "userinfo@")}`, async () => {
    const h = harness();
    await rejects(h.request({ ...options, url }, "eth_chainId", []), "BSC_RPC_AUTH_CONFIG_INVALID");
    assert.equal(h.calls.length, 0);
  });
}
for (const apiKey of [" ", "bad\nkey", "bad key", "x".repeat(4097)]) {
  test(`invalid synthetic credential shape ${apiKey.length}`, async () => {
    const h = harness();
    await rejects(h.request({ ...options, apiKey }, "eth_chainId", []), "BSC_RPC_AUTH_CONFIG_INVALID");
    assert.equal(h.calls.length, 0);
  });
}
test("legacy provider needs no new key or URL and keeps generic RPC payload compatibility", async () => {
  const h = harness(() => new Response(JSON.stringify({ result: "0x38" })));
  await h.request({ url: "https://legacy.invalid/rpc" }, "eth_chainId", []);
  assert.deepEqual(h.calls[0].init.headers, { "content-type": "application/json" });
  assert.deepEqual(JSON.parse(h.calls[0].init.body), { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] });
});
test("no sendTransaction or arbitrary RPC method can be requested", async () => {
  const h = harness();
  await rejects(h.request(options, "eth_sendRawTransaction", []), "BSC_RPC_METHOD_NOT_ALLOWED");
  assert.equal(h.calls.length, 0);
});
for (const [status, rpcCode, code, terminal] of [
  [401, null, "BSC_RPC_AUTH_FAILED", true], [403, null, "BSC_RPC_ACCESS_DENIED", true],
  [200, -32021, "BSC_RPC_AUTH_FAILED", true], [429, -32030, "BSC_RPC_QUOTA_EXHAUSTED", true],
  [200, -32030, "BSC_RPC_QUOTA_EXHAUSTED", true], [401, -32031, "BSC_RPC_PROVIDER_UNAVAILABLE", false],
  [429, null, "BSC_RPC_RATE_LIMITED", false], [200, -32029, "BSC_RPC_RATE_LIMITED", false],
  [503, null, "BSC_RPC_HTTP_FAILED", false], [200, -32602, "BSC_RPC_RESPONSE_INVALID", false],
]) {
  test(`error classification HTTP ${status} / RPC ${rpcCode}`, async () => {
    const h = harness(() => reply(undefined, status, rpcCode));
    await rejects(h.request(options, "eth_getLogs", []), code);
    assert.equal(h.calls.length, 1, "no automatic retry");
    await rejects(h.request(options, "eth_chainId", []), terminal ? code : "BSC_RPC_COOLDOWN");
    h.advance(60_000);
    await rejects(h.request(options, "eth_getLogs", []), code);
    assert.equal(h.calls.length, terminal ? 1 : 2);
  });
}
test("terminal auth failure is cleared only on a deliberate configuration identity change", async () => {
  const h = harness((_u, _i, n) => n === 1 ? reply(undefined, 401) : reply());
  await rejects(h.request(options, "eth_chainId", []), "BSC_RPC_AUTH_FAILED");
  await h.request({ ...options, apiKey: "another-synthetic-key" }, "eth_chainId", []);
  assert.equal(h.calls.length, 2);
});
test("60/120 second backoff survives successful chain probes, and obeys Retry-After", async () => {
  const h = harness((_u, init) => JSON.parse(init.body).method === "eth_getLogs" ? reply(undefined, 429) : reply());
  await assert.rejects(h.request(options, "eth_getLogs", []), (e) => e.retryAfterMs === 60_000);
  h.advance(60_000);
  await h.request(options, "eth_chainId", []);
  await assert.rejects(h.request(options, "eth_getLogs", []), (e) => e.retryAfterMs === 120_000);
  const r = harness(() => reply(undefined, 429, null, { "retry-after": "180" }));
  await assert.rejects(r.request(options, "eth_getLogs", []), (e) => e.retryAfterMs === 180_000);
});
test("repeated transient failures cap exponential backoff at fifteen minutes", async () => {
  const h = harness(() => reply(undefined, 503));
  for (const expected of [60_000, 120_000, 240_000, 480_000, 900_000, 900_000]) {
    await assert.rejects(h.request(options, "eth_getLogs", []), (e) => e.retryAfterMs === expected);
    h.advance(expected);
  }
  assert.equal(h.calls.length, 6);
});
test("private scanner overrides remain optional, independent of payment/manual receipt URLs", () => {
  const names = ["RECHARGE_BEP20_RPC_URL", "RECHARGE_BEP20_BLOCKMACHINE_API_KEY"];
  const before = names.map((name) => process.env[name]);
  try {
    for (const name of names) delete process.env[name];
    assert.deepEqual(api.scannerRpcOptions("https://legacy.invalid"), { url: "https://legacy.invalid", apiKey: undefined });
    process.env.RECHARGE_BEP20_RPC_URL = options.url;
    process.env.RECHARGE_BEP20_BLOCKMACHINE_API_KEY = options.apiKey;
    assert.deepEqual(api.scannerRpcOptions("https://legacy.invalid"), options);
  } finally { names.forEach((name, index) => { if (before[index] === undefined) delete process.env[name]; else process.env[name] = before[index]; }); }
});
test("date Retry-After and excessively long numeric retry windows fail safely", async () => {
  const h = harness(() => reply(undefined, 429, null, { "retry-after": new Date(181_000).toUTCString() }));
  await assert.rejects(h.request(options, "eth_chainId", []), (e) => e.retryAfterMs === 180_000);
  for (const raw of ["999999999", "9".repeat(400)]) {
    const r = harness(() => reply(undefined, 429, null, { "retry-after": raw }));
    await rejects(r.request(options, "eth_chainId", []), "BSC_RPC_RETRY_WINDOW_EXCESSIVE");
  }
});
test("Blockmachine traffic is paced at >=1100ms even without a key", async () => {
  const h = harness();
  for (let i = 0; i < 4; i++) await h.request({ url: options.url }, "eth_chainId", []);
  for (let i = 1; i < 4; i++) assert.ok(h.calls[i].at - h.calls[i - 1].at >= 1100);
});
test("network/redirect failure never retains raw sensitive exception", async () => {
  const h = harness(() => { throw Error("provider-secret-not-retained synthetic-test-only-key"); });
  await rejects(h.request(options, "eth_chainId", []), "BSC_RPC_UNCERTAIN");
});
test("hung fetch and hung response-body reads are time bounded", async () => {
  for (const fetch of [() => new Promise(() => {}), async () => ({ json: () => new Promise(() => {}) })]) {
    const r = api.createScannerRpcTransport({ fetch, timeoutMs: 10 });
    await rejects(r(options, "eth_chainId", []), "BSC_RPC_TIMEOUT");
    await rejects(r(options, "eth_chainId", []), "BSC_RPC_COOLDOWN");
  }
});
test("overlapping calls do not bypass serialized pacing", async () => {
  let finish;
  const h = harness(() => new Promise((resolve) => { finish = resolve; }));
  const pending = h.request(options, "eth_chainId", []);
  await rejects(h.request(options, "eth_chainId", []), "BSC_RPC_BUSY");
  finish(reply());
  await pending;
  assert.equal(h.calls.length, 1);
});
for (const payload of [{ result: "0x38" }, { jsonrpc: "2.0", id: 2, result: "0x38" }, { jsonrpc: "2.0", id: 1 }, null]) {
  test(`malformed/mismatched Blockmachine response ${JSON.stringify(payload)}`, async () => {
    const h = harness(() => new Response(JSON.stringify(payload)));
    await rejects(h.request(options, "eth_chainId", []), "BSC_RPC_RESPONSE_INVALID");
  });
}

// Actual scanner code; only network/database/email boundaries use deterministic,
// in-memory synthetic adapters. No Production/Test database or key is accessed.
const envNames = ["BSC_RPC_URL", "BSC_CHAIN_ID", "BSC_USDT_CONTRACT", "BSC_USDT_DECIMALS", "BSC_REQUIRED_CONFIRMATIONS", "RECHARGE_BEP20_LOG_CHUNK_SIZE", "RECHARGE_BEP20_MAX_BLOCKS_PER_RUN", "RECHARGE_BEP20_RPC_URL", "RECHARGE_BEP20_BLOCKMACHINE_API_KEY"];
const token = "0x" + "11".repeat(20), receiver = "0x" + "22".repeat(20), sender = "0x" + "33".repeat(20);
const topic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const hash = "0x" + "44".repeat(32), tx = "0x" + "55".repeat(32);
const syntheticLog = () => ({ address: token, topics: [topic, "0x" + sender.slice(2).padStart(64, "0"), "0x" + receiver.slice(2).padStart(64, "0")], data: "0xde0b6b3a7640000", transactionHash: tx, logIndex: "0x0", blockNumber: "0x65", blockHash: hash });
async function scannerScenario(callback, settings = {}) {
  const saved = Object.fromEntries(envNames.map((n) => [n, process.env[n]]));
  Object.assign(process.env, { BSC_RPC_URL: "https://legacy.invalid", BSC_CHAIN_ID: "56", BSC_USDT_CONTRACT: token, BSC_USDT_DECIMALS: "18", BSC_REQUIRED_CONFIRMATIONS: "12", RECHARGE_BEP20_LOG_CHUNK_SIZE: "50", RECHARGE_BEP20_MAX_BLOCKS_PER_RUN: "100", RECHARGE_BEP20_RPC_URL: options.url, RECHARGE_BEP20_BLOCKMACHINE_API_KEY: options.apiKey });
  const state = { cursor: 100, ranges: [], rpcCalls: 0, claims: new Set(), credits: 0, emails: 0, matches: [], cursorWrites: 0 };
  const service = {
    from(table) {
      const query = { select() { return this; }, or() { return this; }, eq() { return this; },
        async maybeSingle() { return { data: table === "payment_channels" ? { public_config: { token_contract: token, payment_address: receiver } } : { last_scanned_block: state.cursor }, error: null }; },
        async upsert(row) {
          state.cursorWrites++;
          if (settings.cursorFailure && state.cursorWrites === 1) return { error: { code: "SYNTHETIC_FAILURE" } };
          state.cursor = Number(row.last_scanned_block); return { error: null };
        },
      };
      assert.ok(["payment_channels", "account_recharge_bep20_scan_state"].includes(table));
      return query;
    },
    async rpc(name, args) {
      assert.equal(name, "match_and_credit_account_recharge_bep20_v3");
      state.matches.push(args);
      const claim = `${args.p_chain_id}:${args.p_tx_hash}`;
      const duplicate = state.claims.has(claim);
      state.claims.add(claim);
      if (!duplicate) state.credits++;
      if (settings.matchFailure && state.matches.length === 1) return { error: { code: "UNCERTAIN_AFTER_SYNTHETIC_COMMIT" } };
      if (settings.badMatch) return { data: { result: "unexpected", credited: false, alreadyCredited: false } };
      return { data: { result: duplicate ? "already_matched" : "matched", credited: !duplicate, alreadyCredited: duplicate, rechargeId: "synthetic-recharge" }, error: null };
    },
  };
  const h = harness((_url, init) => {
    assert.equal(init.headers.Authorization, `Bearer ${options.apiKey}`);
    const { method, params } = JSON.parse(init.body);
    state.rpcCalls++;
    if (method === "eth_chainId") return reply(settings.wrongChain ? "0x1" : "0x38");
    if (method === "eth_call") return reply("0x12");
    if (method === "eth_blockNumber") return reply("0x100");
    if (method === "eth_getBlockByNumber") return reply({ number: "0x65", timestamp: "0x68000000", hash: settings.badBlock ? "0x" + "66".repeat(32) : hash });
    assert.equal(method, "eth_getLogs");
    const f = params[0]; state.ranges.push([Number(BigInt(f.fromBlock)), Number(BigInt(f.toBlock))]);
    assert.equal(f.address, token); assert.equal(f.topics[2], "0x" + receiver.slice(2).padStart(64, "0"));
    if (settings.rpcFailure && state.ranges.length === 2) return reply(undefined, 429);
    return reply(Number(BigInt(f.fromBlock)) === 101 ? [syntheticLog(), ...(settings.duplicateLog ? [syntheticLog()] : [])] : []);
  });
  const scanner = load("lib/recharges/bep20-recharge-scanner.ts", {
    "@/lib/supabase/service-role": { getSupabaseServiceRoleClient: () => service },
    "@/lib/email/recharge-success": { queueRechargeSuccessEmailBestEffort: async () => { state.emails++; } },
    "@/lib/recharges/bep20-scanner-rpc": { ...api, requestScannerRpc: h.request },
    "@/lib/recharges/bep20-order-scan-planner": load("lib/recharges/bep20-order-scan-planner.ts"),
  });
  try { await callback(scanner.scanRechargeBep20Transfers, state); }
  finally { for (const n of envNames) { if (saved[n] === undefined) delete process.env[n]; else process.env[n] = saved[n]; } }
}
test("scanner override leaves shared legacy RPC unchanged and matches synthetic transfer evidence", async () => {
  await scannerScenario(async (scan, s) => {
    const r = await scan();
    assert.equal(process.env.BSC_RPC_URL, "https://legacy.invalid");
    assert.deepEqual(s.ranges, [[101, 150], [151, 200]]);
    assert.equal(r.scannedBlocks, 100); assert.equal(r.credited, 1); assert.equal(s.cursor, 200);
    assert.equal(s.matches[0].p_actual_received_usdt, "1");
    assert.equal(s.matches[0].p_confirmation_count, 156);
  });
});
test("dry-run archive matching never invokes credit/email/cursor writes", async () => {
  await scannerScenario(async (scan, s) => { const r = await scan({ dryRun: true }); assert.equal(r.scannedTransfers, 1); assert.equal(s.matches.length, 0); assert.equal(s.cursor, 100); assert.equal(s.cursorWrites, 0); assert.equal(s.emails, 0); });
});
test("second-chunk RPC failure advances only completed first chunk, no automatic retry", async () => {
  await scannerScenario(async (scan, s) => { await rejects(scan(), "BSC_RPC_RATE_LIMITED"); assert.equal(s.cursor, 150); assert.equal(s.ranges.length, 2); await rejects(scan(), "BSC_RPC_COOLDOWN"); assert.equal(s.ranges.length, 2); }, { rpcFailure: true });
});
for (const setting of ["matchFailure", "cursorFailure"]) {
  test(`${setting}: uncertain persistence stops, replay deduplicates in synthetic database adapter`, async () => {
    await scannerScenario(async (scan, s) => {
      await rejects(scan(), setting === "matchFailure" ? "RECHARGE_SCANNER_MATCH_UNCERTAIN" : "RECHARGE_SCANNER_CURSOR_UNCERTAIN");
      assert.equal(s.cursor, 100); assert.equal(s.credits, 1);
      const r = await scan(); assert.equal(r.alreadyCredited, 1); assert.equal(s.credits, 1); assert.equal(s.cursor, 200);
    }, { [setting]: true });
  });
}
test("duplicate notification cannot double credit in synthetic dedup contract", async () => {
  await scannerScenario(async (scan, s) => { const r = await scan(); assert.equal(r.credited, 1); assert.equal(r.alreadyCredited, 1); assert.equal(s.credits, 1); }, { duplicateLog: true });
});
for (const [setting, code] of [["wrongChain", "BSC_CHAIN_ID_RPC_MISMATCH"], ["badBlock", "BSC_BLOCK_EVIDENCE_MISMATCH"], ["badMatch", "RECHARGE_SCANNER_MATCH_RESULT_UNKNOWN"]]) {
  test(`${setting}: validation stops cursor progression`, async () => {
    await scannerScenario(async (scan, s) => { await rejects(scan(), code); assert.equal(s.cursor, 100); assert.equal(s.cursorWrites, 0); }, { [setting]: true });
  });
}
