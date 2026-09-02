import "server-only";

import {
  getReleaseBuildArtifactTime,
  inferReleaseCommit,
  parseReleaseCommit,
} from "@/lib/system/release-metadata.mjs";

export type ReleaseInfo = {
  release: string;
  commit: string;
  shortCommit: string;
  branch: string;
  buildTime: string;
  environment: string;
  schemaVersion: string;
};

function firstNonEmpty(...values: Array<string | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim();
}

export function getReleaseInfo(schemaVersion = "unverified"): ReleaseInfo {
  // The process cwd is the running artifact selected by PM2. The configured
  // release directory is only a fallback if cwd is unavailable/non-standard.
  const releaseDirectories = [process.cwd(), process.env.JIANLIAN_RELEASE_DIR];
  const commit =
    firstNonEmpty(
      process.env.VERCEL_GIT_COMMIT_SHA,
      process.env.GITHUB_SHA,
      process.env.GIT_COMMIT,
      process.env.NEXT_PUBLIC_COMMIT_SHA
    ) ?? inferReleaseCommit(releaseDirectories) ?? "unknown";
  const artifactDirectory = releaseDirectories.find((value) => parseReleaseCommit(value));
  const buildTime =
    firstNonEmpty(process.env.BUILD_TIME, process.env.NEXT_PUBLIC_BUILD_TIME) ??
    getReleaseBuildArtifactTime(artifactDirectory) ??
    "unknown";

  return {
    release: firstNonEmpty(process.env.NEXT_PUBLIC_APP_VERSION, process.env.APP_VERSION) ?? "0.1.0",
    commit,
    shortCommit: commit !== "unknown" ? commit.slice(0, 12) : "unknown",
    branch:
      firstNonEmpty(
        process.env.VERCEL_GIT_COMMIT_REF,
        process.env.GITHUB_REF_NAME,
        process.env.GIT_BRANCH,
        process.env.NEXT_PUBLIC_GIT_BRANCH
      ) ?? "unknown",
    buildTime,
    environment: firstNonEmpty(process.env.APP_ENV, process.env.NODE_ENV) ?? "unknown",
    schemaVersion,
  };
}
