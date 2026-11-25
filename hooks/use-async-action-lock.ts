"use client";

import { useCallback, useRef, useState } from "react";

export function useAsyncActionLock() {
  const lockRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const runLocked = useCallback(async <T>(action: () => Promise<T>): Promise<T | undefined> => {
    if (lockRef.current) return undefined;
    lockRef.current = true;
    setBusy(true);
    try {
      return await action();
    } finally {
      lockRef.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, lockRef, runLocked };
}
