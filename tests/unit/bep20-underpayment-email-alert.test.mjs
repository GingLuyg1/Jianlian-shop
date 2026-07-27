import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
  stat,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  runEmailAlert,
} from "../../scripts/ops/bep20-underpayment-email-alert.mjs";

const alertSource = readFileSync(
  new URL("../../scripts/ops/bep20-underpayment-email-alert.mjs", import.meta.url),
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

async function withTemporaryState(callback) {
  const directory = await mkdtemp(join(tmpdir(), "jianlian-bep20-alert-"));
  try {
    return await callback(join(directory, "state.json"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function monitorPayload(candidateCount, requestId = "monitor-request-1234567890") {
  return {
    success: true,
    eligible: candidateCount > 0,
    preview: {
      candidate_count: candidateCount,
      request_id: requestId,
      candidates: candidateCount > 0
        ? [{
            session_id: "67da940b-cf5c-4682-a457-a86355a8b111",
            receive_address: "0x1111111111111111111111111111111111111111",
            tx_hash: `0x${"a".repeat(64)}`,
          }]
        : [],
    },
  };
}

function options(baseUrl, stateFile, overrides = {}) {
  return {
    baseUrl,
    secret: "internal-job-test-secret",
    resendApiKey: "re_test_api_key",
    emailFrom: "Alert Sender <sender@example.test>",
    recipient: "recipient@example.test",
    stateFile,
    resendEndpoint: `${baseUrl}/emails`,
    write() {},
    ...overrides,
  };
}

async function readRequestJson(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
}

function assertUnavailableCandidateCount(payload) {
  assert.match(payload.text, /candidate_count：不可用/);
  assert.doesNotMatch(payload.text, /candidate_count：0(?:\D|$)/);
}

test("email alert imports the GET-only monitor and never enables settlement", () => {
  assert.match(
    alertSource,
    /import\s*\{[\s\S]*runMonitor[\s\S]*\}\s*from "\.\/bep20-underpayment-dry-run-monitor\.mjs"/,
  );
  assert.doesNotMatch(alertSource, /action=settle|dry_run=false/);
  assert.doesNotMatch(alertSource, /\/settle[^"'\n]*method:\s*"POST"/);
  assert.match(alertSource, /https:\/\/api\.resend\.com\/emails/);
  assert.match(alertSource, /"idempotency-key"/);
});

test("healthy monitor result sends no email and exits zero", async () => {
  await withTemporaryState((stateFile) => withServer((request, response) => {
    assert.equal(request.method, "GET");
    assert.match(request.url ?? "", /underpayments\/settle\?limit=10/);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(monitorPayload(0)));
  }, async (baseUrl) => {
    let resendCalls = 0;
    const output = [];
    const result = await runEmailAlert(options(baseUrl, stateFile, {
      resendFetchImpl: async () => {
        resendCalls += 1;
        throw new Error("must not send");
      },
      write: (line) => output.push(line),
    }));

    assert.equal(result.exitCode, 0);
    assert.equal(resendCalls, 0);
    assert.deepEqual(JSON.parse(output[0]), {
      timestamp: JSON.parse(output[0]).timestamp,
      success: true,
      monitor_exit: 0,
      alert_type: "none",
      alert_sent: false,
      alert_suppressed: false,
      candidate_count: 0,
      http_status: 200,
      masked_request_id: "monito...7890",
      resend_http_status: 0,
    });
  }));
});

test("candidate monitor result sends one safe email and exits two", async () => {
  await withTemporaryState((stateFile) => withServer(async (request, response) => {
    if (request.url?.startsWith("/api/internal/")) {
      assert.equal(request.method, "GET");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(monitorPayload(1)));
      return;
    }

    assert.equal(request.method, "POST");
    assert.equal(request.url, "/emails");
    assert.match(String(request.headers.authorization), /^Bearer /);
    assert.ok(request.headers["idempotency-key"]);
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    const safeEmailText = `${payload.subject}\n${payload.text}`;
    assert.match(safeEmailText, /发现 BEP20 欠额候选/);
    assert.match(safeEmailText, /请进入后台人工复核/);
    assert.match(safeEmailText, /未执行自动结算/);
    assert.doesNotMatch(
      safeEmailText,
      /67da940b-cf5c-4682-a457-a86355a8b111|0x1111111111111111111111111111111111111111|0x[a-f0-9]{64}/i,
    );
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ id: "mock-email-id" }));
  }, async (baseUrl) => {
    const output = [];
    const result = await runEmailAlert(options(baseUrl, stateFile, {
      resendFetchImpl: fetch,
      write: (line) => output.push(line),
    }));
    assert.equal(result.exitCode, 2);
    const summary = JSON.parse(output[0]);
    assert.equal(summary.alert_type, "candidate_detected");
    assert.equal(summary.alert_sent, true);
    assert.equal(summary.candidate_count, 1);
    assert.equal(summary.resend_http_status, 200);
  }));
});

test("monitor failures send one fault email and exit three", async (t) => {
  for (const status of [401, 403, 429, 503]) {
    await t.test(`monitor HTTP ${status}`, async () => {
      let emailPayload;
      await withTemporaryState((stateFile) => withServer(async (request, response) => {
        if (request.url?.startsWith("/api/internal/")) {
          response.writeHead(status, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: "internal detail" }));
          return;
        }
        emailPayload = await readRequestJson(request);
        response.writeHead(200, { "content-type": "application/json" });
        response.end("{}");
      }, async (baseUrl) => {
        const result = await runEmailAlert(options(baseUrl, stateFile, {
          resendFetchImpl: fetch,
        }));
        assert.equal(result.exitCode, 3);
        assertUnavailableCandidateCount(emailPayload);
      }));
    });
  }

  await t.test("monitor timeout", async () => {
    let emailPayload;
    await withTemporaryState((stateFile) => withServer(async (request, response) => {
      if (request.url?.startsWith("/api/internal/")) return;
      emailPayload = await readRequestJson(request);
      response.writeHead(200);
      response.end("{}");
    }, async (baseUrl) => {
      const result = await runEmailAlert(options(baseUrl, stateFile, {
        monitorTimeoutMs: 25,
        resendFetchImpl: fetch,
      }));
      assert.equal(result.exitCode, 3);
      assertUnavailableCandidateCount(emailPayload);
    }));
  });

  await t.test("invalid monitor response", async () => {
    let emailPayload;
    await withTemporaryState((stateFile) => withServer(async (request, response) => {
      if (request.url?.startsWith("/api/internal/")) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ success: true, preview: { candidate_count: "1" } }));
        return;
      }
      emailPayload = await readRequestJson(request);
      response.writeHead(200);
      response.end("{}");
    }, async (baseUrl) => {
      const result = await runEmailAlert(options(baseUrl, stateFile, {
        resendFetchImpl: fetch,
      }));
      assert.equal(result.exitCode, 3);
      assertUnavailableCandidateCount(emailPayload);
    }));
  });
});

test("Resend failures and timeout return one without leaking response data", async (t) => {
  for (const status of [400, 401, 429, 500]) {
    await t.test(`Resend HTTP ${status}`, async () => {
      await withTemporaryState((stateFile) => withServer((request, response) => {
        if (request.url?.startsWith("/api/internal/")) {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify(monitorPayload(1)));
          return;
        }
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify({ message: "provider detail" }));
      }, async (baseUrl) => {
        const output = [];
        const result = await runEmailAlert(options(baseUrl, stateFile, {
          resendFetchImpl: fetch,
          write: (line) => output.push(line),
        }));
        assert.equal(result.exitCode, 1);
        assert.equal(JSON.parse(output[0]).resend_http_status, status);
        assert.doesNotMatch(output[0], /provider detail/);
      }));
    });
  }

  await t.test("Resend timeout", async () => {
    await withTemporaryState((stateFile) => withServer((request, response) => {
      if (request.url?.startsWith("/api/internal/")) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(monitorPayload(1)));
      }
    }, async (baseUrl) => {
      const result = await runEmailAlert(options(baseUrl, stateFile, {
        resendFetchImpl: fetch,
        resendTimeoutMs: 25,
      }));
      assert.equal(result.exitCode, 1);
    }));
  });
});

test("matching fingerprint is suppressed during cooldown and sent again afterwards", async () => {
  await withTemporaryState((stateFile) => withServer((request, response) => {
    if (request.url?.startsWith("/api/internal/")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(monitorPayload(2)));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  }, async (baseUrl) => {
    const start = Date.parse("2026-07-27T00:00:00.000Z");
    let resendCalls = 0;
    const resendFetchImpl = async (...args) => {
      resendCalls += 1;
      return fetch(...args);
    };

    const first = await runEmailAlert(options(baseUrl, stateFile, {
      now: () => start,
      resendFetchImpl,
    }));
    const suppressedOutput = [];
    const second = await runEmailAlert(options(baseUrl, stateFile, {
      now: () => start + 60_000,
      resendFetchImpl,
      write: (line) => suppressedOutput.push(line),
    }));
    const third = await runEmailAlert(options(baseUrl, stateFile, {
      now: () => start + 361 * 60_000,
      resendFetchImpl,
    }));

    assert.equal(first.exitCode, 2);
    assert.equal(second.exitCode, 2);
    assert.equal(third.exitCode, 2);
    assert.equal(resendCalls, 2);
    assert.equal(JSON.parse(suppressedOutput[0]).alert_suppressed, true);
  }));
});

test("state is safe, mode 0600 on POSIX, and logs redact all configured secrets", async () => {
  await withTemporaryState((stateFile) => withServer((request, response) => {
    if (request.url?.startsWith("/api/internal/")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(monitorPayload(
        1,
        "f3ccda66-7768-46d0-afd3-059c6642e578",
      )));
      return;
    }
    response.writeHead(200);
    response.end("{}");
  }, async (baseUrl) => {
    const output = [];
    const configured = options(baseUrl, stateFile, {
      resendFetchImpl: fetch,
      write: (line) => output.push(line),
    });
    const result = await runEmailAlert(configured);
    assert.equal(result.exitCode, 2);

    const stateText = await readFile(stateFile, "utf8");
    assert.deepEqual(Object.keys(JSON.parse(stateText)).sort(), [
      "fingerprint",
      "last_sent_at",
      "version",
    ]);
    assert.doesNotMatch(
      stateText,
      /re_test_api_key|internal-job-test-secret|recipient@example\.test|f3ccda66-7768-46d0-afd3-059c6642e578/,
    );
    if (process.platform !== "win32") {
      assert.equal((await stat(stateFile)).mode & 0o777, 0o600);
    }
    assert.match(alertSource, /mode:\s*0o600/);
    assert.match(alertSource, /chmod\(stateFile,\s*0o600\)/);

    assert.equal(output.length, 1);
    assert.doesNotMatch(
      output[0],
      /re_test_api_key|internal-job-test-secret|recipient@example\.test|sender@example\.test|f3ccda66-7768-46d0-afd3-059c6642e578/,
    );
    assert.equal(JSON.parse(output[0]).masked_request_id, "f3ccda...e578");
  }));
});
