"use client";

import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import styles from "./RechargeChannelGrid.module.css";

type RecordTab = "recharges" | "balance";
const tabs = [
  { value: "recharges", label: "充值记录", id: "recharge-history-tab", panel: "recharge-history-content" },
  { value: "balance", label: "资金变动记录", id: "balance-history-tab", panel: "balance-history-content" },
] as const;

export default function RechargeRecordTabs({ value, onChange }: { value: RecordTab; onChange: (value: RecordTab) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    switch (event.key) {
      case "ArrowRight": next = (index + 1) % tabs.length; break;
      case "ArrowLeft": next = (index + tabs.length - 1) % tabs.length; break;
      case "Home": next = 0; break;
      case "End": next = tabs.length - 1; break;
      default: return;
    }
    event.preventDefault();
    refs.current[next]?.focus();
    onChange(tabs[next].value);
  }
  return <div role="tablist" aria-label="账户记录" data-active-tab={value} className={styles.recordTabs}>
    <span data-testid="record-tab-indicator" aria-hidden="true" className={styles.recordIndicator} />
    {tabs.map((tab, index) => <button key={tab.value} ref={(node) => { refs.current[index] = node; }} id={tab.id} type="button" role="tab" aria-selected={value === tab.value} aria-controls={tab.panel} tabIndex={value === tab.value ? 0 : -1} onClick={() => onChange(tab.value)} onKeyDown={(event) => onKeyDown(event, index)} className={cn("relative z-10 flex h-9 min-w-0 items-center justify-center rounded-xl px-1 text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 motion-reduce:transition-none lg:px-2 lg:text-sm", value === tab.value ? "text-white" : "text-[#786c63]")}>{tab.label}</button>)}
  </div>;
}
