// Local metadata store, separate from all application databases and credentials.
import { mkdir, mkdtemp, lstat, open, readFile, writeFile, rename, unlink, realpath } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
export function isAllowedWindowsWorkspaceDirectory(directory) {
  // Check before normalization: dot segments, UNC/device paths and extra depth
  // must not be normalized into an allowed production metadata directory.
  return typeof directory === "string" &&
    /^D:[\\/]Jianlian[\\/]_bitrefill_[A-Za-z0-9_-]+(?:[\\/][A-Za-z0-9_-]+)?$/i.test(directory);
}
export async function createWorkspaceBackend(directory) {
  if (process.platform !== "win32" || !isAllowedWindowsWorkspaceDirectory(directory)) throw new Error("WORKSPACE_PATH_NOT_ALLOWED");
  return openWorkspaceBackend(resolve(directory), "D:\\Jianlian", false);
}
// No caller-selected directory or environment-variable bypass. Each synthetic
// fixture owns one fresh OS temporary directory; it can only reopen that path.
export async function createSyntheticWorkspaceFixture(...args) {
  if (args.length) throw new Error("WORKSPACE_PATH_NOT_ALLOWED");
  const directory = await mkdtemp(join(await realpath(tmpdir()), "jianlian-bitrefill-synthetic-"));
  return Object.freeze({ directory, open: (...openArgs) => {
    if (openArgs.length) throw new Error("WORKSPACE_PATH_NOT_ALLOWED");
    return openWorkspaceBackend(directory, directory, true);
  } });
}
async function openWorkspaceBackend(target, root, synthetic) {
  let parent = root;
  const parts = relative(root, target).split(/[\\/]/).filter(Boolean);
  for (const part of ["", ...parts]) {
    parent = part ? join(parent, part) : parent;
    let info = await lstat(parent).catch((e) => { if (e.code === "ENOENT") return null; throw e; });
    if (!info) { await mkdir(parent); info = await lstat(parent); }
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("WORKSPACE_REPARSE_NOT_ALLOWED");
  }
  if (!(await lstat(target)).isDirectory() || (await lstat(target)).isSymbolicLink()) throw new Error("WORKSPACE_REPARSE_NOT_ALLOWED");
  const lockPath = join(target, "workspace.lock"), statePath = join(target, "metadata.json");
  const lock = await open(lockPath, "wx");
  let state;
  try {
    const info = await lstat(statePath).catch((e) => { if (e.code === "ENOENT") return null; throw e; });
    if (info && (!info.isFile() || info.isSymbolicLink() || info.size > 4 * 1024 * 1024)) throw new Error("WORKSPACE_STATE_INVALID");
    state = info ? JSON.parse(await readFile(statePath, "utf8")) : {};
    if (!state || Array.isArray(state) || typeof state !== "object") throw new Error("WORKSPACE_STATE_INVALID");
  } catch (error) { await lock.close(); await unlink(lockPath); throw error; }
  let tail = Promise.resolve(), closed = false;
  return { scope: "bitrefill_local_workspace", synthetic,
    async read() { if (closed) throw new Error("WORKSPACE_CLOSED"); return structuredClone(state); },
    transact(fn) {
      const task = tail.then(async () => {
        if (closed) throw new Error("WORKSPACE_CLOSED");
        const copy = structuredClone(state), result = fn(copy);
        if (result instanceof Promise) throw new Error("WORKSPACE_SYNC_TRANSACTION_REQUIRED");
        const json = JSON.stringify(copy, null, 2);
        if (Buffer.byteLength(json) > 4 * 1024 * 1024) throw new Error("WORKSPACE_SIZE_LIMIT");
        const temp = join(target, `metadata-${randomUUID()}.tmp`);
        try { await writeFile(temp, json, { flag: "wx" }); await rename(temp, statePath); }
        catch (error) { await unlink(temp).catch(() => {}); throw error; }
        state = copy; return structuredClone(result);
      });
      tail = task.catch(() => {}); return task;
    },
    async close() { await tail; if (!closed) { closed = true; await lock.close(); await unlink(lockPath); } },
  };
}
