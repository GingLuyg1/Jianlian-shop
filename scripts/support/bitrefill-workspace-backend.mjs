// Local metadata store, separate from all application databases and credentials.
import { mkdir, lstat, open, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import { randomUUID } from "node:crypto";
export async function createWorkspaceBackend(directory) {
  const target = resolve(directory);
  if (!/^D:\\Jianlian\\_bitrefill_[A-Za-z0-9_-]+(?:\\[A-Za-z0-9_-]+)?$/i.test(target)) throw new Error("WORKSPACE_PATH_NOT_ALLOWED");
  let parent = "D:\\Jianlian";
  const parts = relative(parent, target).split("\\");
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
  return { scope: "bitrefill_local_workspace", synthetic: false,
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
