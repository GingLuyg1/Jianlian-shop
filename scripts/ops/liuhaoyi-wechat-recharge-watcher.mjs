#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { runLiuhaoyiWechatWatcher } from "../../lib/payments/liuhaoyi-wechat-watcher.mjs";

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const result = await runLiuhaoyiWechatWatcher({ args: process.argv.slice(2) });
  if (!["disabled", "finished"].includes(result.status)) process.exitCode = 1;
}
