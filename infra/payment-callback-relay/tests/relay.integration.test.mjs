import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { createRelayServer } from "../src/relay.mjs";

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object");
  return address.port;
}

async function close(server) {
  if (!server.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function requestRaw(port, path, method = "GET") {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: "127.0.0.1", port, path, method },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    request.once("error", reject);
    request.end();
  });
}

async function withRelay(originHandler, run, options = {}) {
  const origin = http.createServer(originHandler);
  const originPort = await listen(origin);
  const logs = [];
  const relay = createRelayServer({
    originBaseUrl: new URL(`http://127.0.0.1:${originPort}`),
    logger: { info: (fields) => logs.push(fields) },
    timeouts: options.timeouts ?? {
      connectMs: 100,
      responseMs: 150,
      totalMs: 250,
    },
  });
  const relayPort = await listen(relay);
  try {
    await run({ relayPort, logs });
  } finally {
    await close(relay);
    await close(origin);
  }
}

test("origin success and exact raw query are passed through for WeChat", async () => {
  const rawQuery = "z=last&name=a+b&encoded=%2Fpay%3Fx%3D1&z=first&sign=TOPSECRET";
  let receivedUrl = "";
  let requestId = "";
  await withRelay(
    (request, response) => {
      receivedUrl = request.url ?? "";
      requestId = String(request.headers["x-request-id"] ?? "");
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end("success");
    },
    async ({ relayPort, logs }) => {
      const result = await requestRaw(relayPort, `/callback/wechat?${rawQuery}`);
      assert.equal(result.status, 200);
      assert.equal(result.body, "success");
      assert.equal(result.headers["cache-control"], "no-store");
      assert.match(String(result.headers["x-request-id"]), /^[0-9a-f-]{36}$/);
      assert.equal(requestId, result.headers["x-request-id"]);
      assert.equal(
        receivedUrl,
        `/api/payments/callback/wechat?${rawQuery}`,
      );
      assert.equal(logs.length, 1);
      assert.equal(logs[0].channel, "wechat");
      assert.equal(logs[0].query_present, true);
      assert.doesNotMatch(JSON.stringify(logs), /TOPSECRET|sign=|encoded=|name=/);
    },
  );
});

test("Alipay uses its fixed origin path", async () => {
  let receivedUrl = "";
  await withRelay(
    (request, response) => {
      receivedUrl = request.url ?? "";
      response.end("success");
    },
    async ({ relayPort }) => {
      const result = await requestRaw(relayPort, "/callback/alipay?out_trade_no=A1");
      assert.equal(result.status, 200);
      assert.equal(receivedUrl, "/api/payments/callback/alipay?out_trade_no=A1");
    },
  );
});

for (const status of [400, 500]) {
  test(`origin ${status} is not masked as success`, async () => {
    await withRelay(
      (_request, response) => {
        response.statusCode = status;
        response.end(`origin-${status}`);
      },
      async ({ relayPort }) => {
        const result = await requestRaw(relayPort, "/callback/wechat?x=1");
        assert.equal(result.status, status);
        assert.equal(result.body, `origin-${status}`);
        assert.notEqual(result.body, "success");
      },
    );
  });
}

test("origin timeout returns 504 without fabricating success", async () => {
  await withRelay(
    (_request, response) => {
      setTimeout(() => response.end("success"), 500);
    },
    async ({ relayPort, logs }) => {
      const result = await requestRaw(relayPort, "/callback/wechat?x=1");
      assert.equal(result.status, 504);
      assert.equal(result.body, "origin timeout");
      assert.equal(logs[0].failure_category, "response_timeout");
    },
  );
});

test("origin connection failure returns 502 without fabricating success", async () => {
  const probe = http.createServer();
  const unusedPort = await listen(probe);
  await close(probe);

  const logs = [];
  const relay = createRelayServer({
    originBaseUrl: new URL(`http://127.0.0.1:${unusedPort}`),
    logger: { info: (fields) => logs.push(fields) },
    timeouts: { connectMs: 100, responseMs: 150, totalMs: 250 },
  });
  const relayPort = await listen(relay);
  try {
    const result = await requestRaw(relayPort, "/callback/wechat?x=1");
    assert.equal(result.status, 502);
    assert.equal(result.body, "origin unavailable");
    assert.equal(logs[0].failure_category, "network_failure");
  } finally {
    await close(relay);
  }
});

test("malformed query is rejected and never reaches origin", async () => {
  let originRequests = 0;
  await withRelay(
    (_request, response) => {
      originRequests += 1;
      response.end("success");
    },
    async ({ relayPort }) => {
      const result = await requestRaw(relayPort, "/callback/wechat?sign=%ZZ");
      assert.equal(result.status, 400);
      assert.equal(result.body, "malformed query");
      assert.equal(originRequests, 0);
    },
  );
});

test("duplicate callbacks are each forwarded without relay dedupe", async () => {
  let originRequests = 0;
  await withRelay(
    (_request, response) => {
      originRequests += 1;
      response.end("success");
    },
    async ({ relayPort }) => {
      const path = "/callback/wechat?out_trade_no=SAME&sign=SAME";
      const first = await requestRaw(relayPort, path);
      const second = await requestRaw(relayPort, path);
      assert.equal(first.body, "success");
      assert.equal(second.body, "success");
      assert.equal(originRequests, 2);
    },
  );
});

test("non-GET methods return 405 and never reach origin", async () => {
  let originRequests = 0;
  await withRelay(
    (_request, response) => {
      originRequests += 1;
      response.end("success");
    },
    async ({ relayPort }) => {
      const result = await requestRaw(relayPort, "/callback/wechat?x=1", "POST");
      assert.equal(result.status, 405);
      assert.equal(result.headers.allow, "GET");
      assert.equal(result.headers["cache-control"], "no-store");
      assert.equal(originRequests, 0);
    },
  );
});

test("unknown paths cannot select an arbitrary origin", async () => {
  let originRequests = 0;
  await withRelay(
    (_request, response) => {
      originRequests += 1;
      response.end("success");
    },
    async ({ relayPort }) => {
      const result = await requestRaw(
        relayPort,
        "/proxy?url=https%3A%2F%2Fevil.example%2Fcallback",
      );
      assert.equal(result.status, 404);
      assert.equal(originRequests, 0);
    },
  );
});
