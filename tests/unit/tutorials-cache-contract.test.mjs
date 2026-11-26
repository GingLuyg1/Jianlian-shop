import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextConfig = require("../../next.config.js");
const { match } = require("next/dist/compiled/path-to-regexp");

test("/tutorials HTML route must never receive long-lived static asset caching", async () => {
  const rules = await nextConfig.headers();
  const matchingRules = rules.filter((rule) => {
    const matcher = match(rule.source);
    return Boolean(matcher("/tutorials"));
  });

  const cacheHeaders = matchingRules
    .flatMap((rule) => rule.headers)
    .filter((header) => header.key.toLowerCase() === "cache-control")
    .map((header) => header.value);

  assert.ok(cacheHeaders.length > 0, "Expected explicit Cache-Control header on /tutorials");
  const effectiveCacheControl = cacheHeaders[cacheHeaders.length - 1];
  assert.match(effectiveCacheControl, /max-age=0/);
  assert.match(effectiveCacheControl, /must-revalidate/);
  assert.doesNotMatch(effectiveCacheControl, /max-age=604800/);
});

test("static tutorial media assets keep 7-day caching", async () => {
  const rules = await nextConfig.headers();
  const mediaMatches = rules.filter((rule) => {
    const matcher = match(rule.source);
    return Boolean(matcher("/tutorials/gemini/step-1.webp"));
  });

  const cacheHeaders = mediaMatches
    .flatMap((rule) => rule.headers)
    .filter((header) => header.key.toLowerCase() === "cache-control")
    .map((header) => header.value);

  assert.ok(
    cacheHeaders.some((value) => value.includes("max-age=604800")),
    "Expected static tutorial images to retain 7-day Cache-Control"
  );
});
