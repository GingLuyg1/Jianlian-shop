"use client";

import { useSyncExternalStore } from "react";
import { accountRecordPreload } from "@/lib/account/record-preload";

export function useAccountRecordIdentity() {
  return useSyncExternalStore(accountRecordPreload.subscribe, accountRecordPreload.getSnapshot, accountRecordPreload.getServerSnapshot);
}
