import "server-only";

export type ReleaseInfo = {
  release: string;
  commit: string;
  buildTime: string;
  environment: string;
  schemaVersion: string;
};

function firstNonEmpty(...values: Array<string | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim();
}

export function getReleaseInfo(schemaVersion = "unverified"): ReleaseInfo {
  return {
    release: firstNonEmpty(process.env.NEXT_PUBLIC_APP_VERSION, process.env.APP_VERSION) ?? "0.1.0",
    commit:
      firstNonEmpty(
        process.env.VERCEL_GIT_COMMIT_SHA,
        process.env.GIT_COMMIT,
        process.env.NEXT_PUBLIC_COMMIT_SHA
      ) ?? "unknown",
    buildTime: firstNonEmpty(process.env.BUILD_TIME, process.env.NEXT_PUBLIC_BUILD_TIME) ?? "unknown",
    environment: firstNonEmpty(process.env.APP_ENV, process.env.NODE_ENV) ?? "unknown",
    schemaVersion,
  };
}
