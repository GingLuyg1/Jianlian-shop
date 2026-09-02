import { statSync } from "node:fs";
import { join } from "node:path";

const RELEASE_DIRECTORY_PATTERN = /^\/www\/releases\/jianlian-shop-([0-9a-f]{40})\/?$/;
const buildTimeCache = new Map();

export function parseReleaseCommit(value) {
  if (typeof value !== "string") return null;
  return RELEASE_DIRECTORY_PATTERN.exec(value)?.[1] ?? null;
}

export function inferReleaseCommit(candidates) {
  for (const candidate of candidates ?? []) {
    const commit = parseReleaseCommit(candidate);
    if (commit) return commit;
  }
  return null;
}

export function getReleaseBuildArtifactTime(releaseDirectory, readStat = statSync) {
  if (!parseReleaseCommit(releaseDirectory)) return null;
  if (readStat === statSync && buildTimeCache.has(releaseDirectory)) {
    return buildTimeCache.get(releaseDirectory);
  }
  try {
    const buildTime = readStat(join(releaseDirectory, ".next", "BUILD_ID")).mtime.toISOString();
    if (readStat === statSync) buildTimeCache.set(releaseDirectory, buildTime);
    return buildTime;
  } catch {
    if (readStat === statSync) buildTimeCache.set(releaseDirectory, null);
    return null;
  }
}
