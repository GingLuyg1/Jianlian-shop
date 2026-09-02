import { statSync } from "node:fs";
import { join } from "node:path";

const RELEASE_DIRECTORY_PATTERN = /(?:^|[\\/])jianlian-shop-([0-9a-f]{40})[\\/]?$/i;

export function parseReleaseCommit(value) {
  if (typeof value !== "string") return null;
  return RELEASE_DIRECTORY_PATTERN.exec(value.trim())?.[1]?.toLowerCase() ?? null;
}

export function inferReleaseCommit(candidates) {
  for (const candidate of candidates ?? []) {
    const commit = parseReleaseCommit(candidate);
    if (commit) return commit;
  }
  return null;
}

export function getReleaseBuildArtifactTime(releaseDirectory) {
  if (!parseReleaseCommit(releaseDirectory)) return null;
  try {
    return statSync(join(releaseDirectory, ".next", "BUILD_ID")).mtime.toISOString();
  } catch {
    return null;
  }
}
