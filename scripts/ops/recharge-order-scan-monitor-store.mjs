import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { initialMonitorState, validateMonitorState } from './recharge-order-scan-alert-state.mjs';

export function createMonitorStore(file) {
  if (!path.isAbsolute(file)) throw Error('ORDER_MONITOR_STATE_PATH_INVALID');
  const directory = path.dirname(file), uid = process.getuid?.();
  function secure(p, directoryExpected = false) {
    const s = fs.lstatSync(p);
    if (s.isSymbolicLink() || (directoryExpected ? !s.isDirectory() : !s.isFile()) ||
        (s.mode & 0o777) !== (directoryExpected ? 0o700 : 0o600) || uid !== undefined && s.uid !== uid) {
      throw Error('ORDER_MONITOR_STATE_PERMISSIONS');
    }
  }
  return {
    async transact(task) {
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      for (let p = directory; p !== path.dirname(p); p = path.dirname(p)) {
        if (fs.lstatSync(p).isSymbolicLink()) throw Error('ORDER_MONITOR_STATE_SYMLINK');
      }
      secure(directory, true);
      const lock = file + '.lock';
      let fd;
      try { fd = fs.openSync(lock, 'wx', 0o600); }
      catch { throw Error('ORDER_MONITOR_STATE_LOCKED'); }
      try {
        let state = initialMonitorState();
        let present = true;
        try { fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') present = false; else throw error; }
        if (present) {
          secure(file);
          if (fs.statSync(file).size > 8192) throw Error('ORDER_MONITOR_STATE_TOO_LARGE');
          state = validateMonitorState(JSON.parse(fs.readFileSync(file, 'utf8')));
        }
        const save = async next => {
          const safe = validateMonitorState(next), temporary = file + '.' + randomUUID() + '.tmp';
          let temporaryFd;
          try {
            temporaryFd = fs.openSync(temporary, 'wx', 0o600);
            fs.writeFileSync(temporaryFd, JSON.stringify(safe) + '\n'); fs.fsyncSync(temporaryFd);
            fs.closeSync(temporaryFd); temporaryFd = undefined;
            fs.renameSync(temporary, file);
          } finally {
            if (temporaryFd !== undefined) fs.closeSync(temporaryFd);
            if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
          }
        };
        return await task(state, save);
      } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
    },
  };
}
