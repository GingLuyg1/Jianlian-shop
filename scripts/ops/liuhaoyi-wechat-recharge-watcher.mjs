#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { runLiuhaoyiWechatWatcher } from "../../lib/payments/liuhaoyi-wechat-watcher.mjs";

const LOCK_PATH = "/run/lock/jianlian-liuhaoyi-wechat-recovery.lock";
const LOCK_MARKER = "--watcher-lock-held";

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (!args.includes(LOCK_MARKER)) {
    // A direct manual invocation takes the same OS lock as the systemd service.
    // The child is the only process allowed to scan or call recovery.
    const locked = spawnSync("/usr/bin/flock", [
      "-n", "-E", "0", LOCK_PATH, process.execPath, process.argv[1], LOCK_MARKER, ...args,
    ], { stdio: "inherit" });
    process.exitCode = locked.error ? 1 : locked.status ?? 1;
    if (locked.error) process.stderr.write("wechat_watcher_lock_unavailable\n");
  } else {
    const result = await runLiuhaoyiWechatWatcher({ args: args.filter((arg) => arg !== LOCK_MARKER) });
    if (!["disabled", "finished"].includes(result.status)) process.exitCode = 1;
  }
}
