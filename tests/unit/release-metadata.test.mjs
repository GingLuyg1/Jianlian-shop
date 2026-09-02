import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { getReleaseBuildArtifactTime, inferReleaseCommit, parseReleaseCommit } from "../../lib/system/release-metadata.mjs";

const SHA = "4ea8c291a8bbb77512df705b783158dc9ff58407";

test("release commit fallback accepts only a full-SHA Jianlian release directory", () => {
  assert.equal(parseReleaseCommit(`/www/releases/jianlian-shop-${SHA}`), SHA);
  assert.equal(parseReleaseCommit(`D:\\releases\\jianlian-shop-${SHA.toUpperCase()}`), SHA);
  assert.equal(parseReleaseCommit("/www/releases/jianlian-shop-main"), null);
  assert.equal(parseReleaseCommit("/www/releases/jianlian-shop-4ea8c291"), null);
  assert.equal(parseReleaseCommit(`/tmp/prefix-jianlian-shop-${SHA}-suffix`), null);
  assert.equal(inferReleaseCommit(["/nonstandard", `/www/releases/jianlian-shop-${SHA}`]), SHA);
});

test("build time fallback uses BUILD_ID mtime only inside a validated release directory", () => {
  const root = mkdtempSync(join(tmpdir(), "jianlian-release-metadata-"));
  const release = join(root, `jianlian-shop-${SHA}`);
  const next = join(release, ".next");
  mkdirSync(next, { recursive: true });
  const buildId = join(next, "BUILD_ID");
  writeFileSync(buildId, "build-id");
  const expected = new Date("2026-09-01T16:20:00.000Z");
  utimesSync(buildId, expected, expected);
  try {
    assert.equal(getReleaseBuildArtifactTime(release), expected.toISOString());
    assert.equal(getReleaseBuildArtifactTime(root), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
