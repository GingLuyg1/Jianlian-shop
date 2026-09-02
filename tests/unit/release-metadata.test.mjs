import test from "node:test";
import assert from "node:assert/strict";

import { getReleaseBuildArtifactTime, inferReleaseCommit, parseReleaseCommit } from "../../lib/system/release-metadata.mjs";

const SHA = "4ea8c291a8bbb77512df705b783158dc9ff58407";

test("release commit fallback accepts only the full production release path", () => {
  assert.equal(parseReleaseCommit(`/www/releases/jianlian-shop-${SHA}`), SHA);
  assert.equal(parseReleaseCommit(`/www/releases/jianlian-shop-${SHA}/`), SHA);
  assert.equal(parseReleaseCommit(`/tmp/jianlian-shop-${SHA}`), null);
  assert.equal(parseReleaseCommit(`D:\\releases\\jianlian-shop-${SHA}`), null);
  assert.equal(parseReleaseCommit(`/www/releases/other-shop-${SHA}`), null);
  assert.equal(parseReleaseCommit(`/www/releases/jianlian-shop-${SHA.toUpperCase()}`), null);
  assert.equal(parseReleaseCommit(` /www/releases/jianlian-shop-${SHA}`), null);
  assert.equal(parseReleaseCommit("/www/releases/jianlian-shop-main"), null);
  assert.equal(parseReleaseCommit("/www/releases/jianlian-shop-4ea8c291"), null);
  assert.equal(parseReleaseCommit(`/tmp/prefix-jianlian-shop-${SHA}-suffix`), null);
  assert.equal(inferReleaseCommit(["/nonstandard", `/www/releases/jianlian-shop-${SHA}`]), SHA);
});

test("build time fallback reads BUILD_ID mtime only inside a validated production release", () => {
  const release = `/www/releases/jianlian-shop-${SHA}`;
  const expected = new Date("2026-09-01T16:20:00.000Z");
  const requestedPaths = [];
  const fakeStat = (path) => {
    requestedPaths.push(path);
    return { mtime: expected };
  };
  assert.equal(getReleaseBuildArtifactTime(release, fakeStat), expected.toISOString());
  assert.match(requestedPaths[0], /\.next[\\/]BUILD_ID$/);
  assert.equal(getReleaseBuildArtifactTime(`/tmp/jianlian-shop-${SHA}`, fakeStat), null);
  assert.equal(requestedPaths.length, 1);
});

test("build time fallback returns null when the artifact stat fails", () => {
  assert.equal(getReleaseBuildArtifactTime(`/www/releases/jianlian-shop-${SHA}`, () => {
    throw new Error("missing");
  }), null);
});
