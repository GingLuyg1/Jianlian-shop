import assert from "node:assert/strict";
import test from "node:test";

import {
  CHANNEL_PATHS,
  hasMalformedPercentEncoding,
  parseRelayTarget,
} from "../src/relay.mjs";

test("relay paths map only to fixed Jianlian callback paths", () => {
  assert.deepEqual(CHANNEL_PATHS, {
    "/callback/wechat": "/api/payments/callback/wechat",
    "/callback/alipay": "/api/payments/callback/alipay",
  });
  assert.equal(parseRelayTarget("/callback/wechat?x=1")?.channel, "wechat");
  assert.equal(parseRelayTarget("/callback/alipay?x=1")?.channel, "alipay");
  assert.equal(parseRelayTarget("/callback/other?url=https://evil.example"), null);
});

test("raw query is retained without parsing or sorting", () => {
  const rawQuery = "z=last&name=a+b&encoded=%2Fpay%3Fx%3D1&z=first&sign=ABC123";
  const parsed = parseRelayTarget(`/callback/wechat?${rawQuery}`);
  assert.equal(parsed?.rawQuery, rawQuery);
  assert.equal(parsed?.originPath, "/api/payments/callback/wechat");
});

test("malformed percent escapes are rejected without decoding valid callback values", () => {
  assert.equal(hasMalformedPercentEncoding("name=a+b&path=%2Fpay"), false);
  assert.equal(hasMalformedPercentEncoding("name=%ZZ"), true);
  assert.equal(hasMalformedPercentEncoding("name=100%"), true);
});
