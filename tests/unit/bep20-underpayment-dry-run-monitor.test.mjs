import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import test from "node:test";

import {
  parseMonitorLimit,
  runMonitor,
} from "../../scripts/ops/bep20-underpayment-dry-run-monitor.mjs";

const scriptSource = readFileSync(
  new URL("../../scripts/ops/bep20-underpayment-dry-run-monitor.mjs", import.meta.url),
  "utf8",
);

async function withServer(handler, callback) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

function captureOutput() {
  const lines = [];
  return {
    lines,
    write(line) {
      lines.push(line);
    },
  };
}

test("BEP20 underpayment monitor is GET-only and keeps settlement disabled", () => {
  assert.match(scriptSource, /method:\s*"GET"/);
  assert.doesNotMatch(scriptSource, /method:\s*"POST"/);
  assert.doesNotMatch(scriptSource, /action=settle|dry_run=false/);
  assert.match(scriptSource, /"x-internal-job-secret": secret/);
  assert.doesNotMatch(scriptSource, /console\.(?:log|error|warn)\([^)]*secret/i);
});

test("BEP20 underpayment monitor returns zero when no candidate exists and clamps limit", async () => {
  let observedMethod = "";
  let observedLimit = "";
  let observedSecret = "";
  const output = captureOutput();

  const result = await withServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    observedMethod = request.method ?? "";
    observedLimit = url.searchParams.get("limit") ?? "";
    observedSecret = String(request.headers["x-internal-job-secret"] ?? "");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      success: true,
      eligible: false,
      preview: {
        candidate_count: 0,
        candidates: [],
        request_id: "2f9c1952-02a6-4f70-9db9-0bf866482906",
      },
    }));
  }, (baseUrl) => runMonitor({
    baseUrl,
    secret: "monitor-test-secret",
    limit: 999,
    write: output.write,
  }));

  assert.equal(result.exitCode, 0);
  assert.equal(observedMethod, "GET");
  assert.equal(observedLimit, "200");
  assert.equal(observedSecret, "monitor-test-secret");
  assert.equal(output.lines.length, 1);
  const summary = JSON.parse(output.lines[0]);
  assert.equal(summary.success, true);
  assert.equal(summary.eligible, false);
  assert.equal(summary.candidate_count, 0);
  assert.equal(summary.http_status, 200);
  assert.equal(summary.request_id, "2f9c19...2906");
  assert.equal(output.lines[0].includes("monitor-test-secret"), false);
});

test("BEP20 underpayment monitor returns two and never logs candidate evidence", async () => {
  const output = captureOutput();
  const sensitiveValues = [
    "f61e1508-cd33-44bb-9b61-0a3f85fc9b80",
    "0x1111111111111111111111111111111111111111",
    `0x${"a".repeat(64)}`,
  ];

  const result = await withServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      success: true,
      eligible: true,
      preview: {
        candidate_count: 1,
        request_id: "monitor-request-1234567890",
        candidates: [{
          session_id: sensitiveValues[0],
          receive_address: sensitiveValues[1],
          tx_hash: sensitiveValues[2],
        }],
      },
    }));
  }, (baseUrl) => runMonitor({
    baseUrl,
    secret: "another-test-secret",
    limit: 10,
    write: output.write,
  }));

  assert.equal(result.exitCode, 2);
  const summary = JSON.parse(output.lines[0]);
  assert.equal(summary.success, true);
  assert.equal(summary.eligible, true);
  assert.equal(summary.candidate_count, 1);
  for (const sensitiveValue of sensitiveValues) {
    assert.equal(output.lines[0].includes(sensitiveValue), false);
  }
  assert.equal(output.lines[0].includes("another-test-secret"), false);
});

test("BEP20 underpayment monitor treats authorization, service, timeout and malformed responses as failures", async (t) => {
  for (const status of [401, 403, 429, 503]) {
    await t.test(`HTTP ${status}`, async () => {
      const output = captureOutput();
      const result = await withServer((_request, response) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify({
          success: false,
          message: "internal details must not be logged",
        }));
      }, (baseUrl) => runMonitor({
        baseUrl,
        secret: "test-secret",
        write: output.write,
      }));

      assert.equal(result.exitCode, 1);
      const summary = JSON.parse(output.lines[0]);
      assert.equal(summary.success, false);
      assert.equal(summary.http_status, status);
      assert.equal(output.lines[0].includes("internal details"), false);
    });
  }

  await t.test("timeout", async () => {
    const output = captureOutput();
    const result = await withServer(() => undefined, (baseUrl) => runMonitor({
      baseUrl,
      secret: "test-secret",
      timeoutMs: 25,
      write: output.write,
    }));
    assert.equal(result.exitCode, 1);
    assert.equal(JSON.parse(output.lines[0]).http_status, 0);
  });

  await t.test("invalid response", async () => {
    const output = captureOutput();
    const result = await withServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ success: true, preview: { candidate_count: "1" } }));
    }, (baseUrl) => runMonitor({
      baseUrl,
      secret: "test-secret",
      write: output.write,
    }));
    assert.equal(result.exitCode, 1);
  });
});

test("BEP20 underpayment monitor clamps limits to the safe range", () => {
  assert.equal(parseMonitorLimit(undefined), 10);
  assert.equal(parseMonitorLimit("invalid"), 10);
  assert.equal(parseMonitorLimit(0), 1);
  assert.equal(parseMonitorLimit(-100), 1);
  assert.equal(parseMonitorLimit(1.9), 1);
  assert.equal(parseMonitorLimit(200), 200);
  assert.equal(parseMonitorLimit(500), 200);
});
