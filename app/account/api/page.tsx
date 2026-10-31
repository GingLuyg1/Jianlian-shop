"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Activity, ArrowUpRight, BookOpen, Code2, KeyRound, LockKeyhole, ReceiptText, ShieldCheck, WalletCards } from "lucide-react";

import glass from "@/components/account/AccountGlass.module.css";
import styles from "@/components/account/AccountCenter.module.css";
import { Button } from "@/components/ui/button";

const tabs = [
  { value: "overview", label: "概览" },
  { value: "calls", label: "调用记录" },
  { value: "orders", label: "API 订单" },
  { value: "security", label: "安全设置" },
] as const;
type ApiTab = (typeof tabs)[number]["value"];

export default function AccountApiPage() {
  const [activeTab, setActiveTab] = useState<ApiTab>("overview");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  return (
    <div data-account-page="/account/api" data-account-ready={true} aria-busy={false} className={`${styles.page} ${styles.apiPage} flex min-w-0 flex-col gap-5`} data-testid="account-api-page">
      <section className={`${glass.surface} ${styles.panel} overflow-hidden`}>
        <header className={`${styles.pageHeader} flex flex-wrap items-center justify-between gap-4`}>
          <div className="flex min-w-0 items-center gap-3">
            <span className={`${glass.icon} h-11 w-11`}><Code2 className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" /></span>
            <div><h1 className="text-xl font-semibold text-slate-900">API 接口</h1><p className="mt-1 text-sm text-slate-500">接口凭证、调用记录与 API 订单管理</p></div>
          </div>
          <Button type="button" variant="outline" disabled title="接口文档暂未开放"><BookOpen className="mr-2 h-4 w-4" aria-hidden="true" />接口文档 · 暂未开放</Button>
        </header>
        <div className="flex items-start gap-2.5 px-6 pb-5 pt-2 text-sm leading-6 text-[#94734f]" role="status">
          <LockKeyhole className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>API 服务暂未开放。开放后可在这里管理接口接入；当前不提供 API Key，也不会通过此页面创建订单或扣款。</p>
        </div>
      </section>

      <div className={styles.apiTop}>
        <section className={`${glass.surface} ${styles.panel} p-5 sm:p-6`} aria-labelledby="api-credentials-title">
          <div className="mb-5 flex items-center justify-between gap-3"><h2 id="api-credentials-title" className="flex items-center gap-2 text-base font-semibold"><KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />我的凭证</h2><span className={styles.pill}>暂未开放</span></div>
          <label htmlFor="account-api-key" className="sr-only">API Key</label>
          <div className="flex min-w-0 flex-wrap gap-2">
            <input id="account-api-key" type="text" value="暂未开放" readOnly disabled className="min-w-0 flex-1 rounded-xl border border-[#e9dfd2] bg-white/65 px-4 py-3 text-sm text-slate-400" />
            <Button type="button" variant="outline" disabled>显示</Button><Button type="button" variant="outline" disabled>复制</Button>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">接口地址：暂未开放</p>
        </section>
        <section className={`${glass.surface} ${styles.panel} p-5 sm:p-6`} aria-labelledby="api-actions-title">
          <h2 id="api-actions-title" className="text-base font-semibold">快捷操作</h2>
          <div className="mt-5 flex flex-wrap gap-2"><Button type="button" variant="outline" disabled>启用接口</Button><Button type="button" variant="outline" disabled>重置 Key</Button></div>
          <p className="mt-3 text-xs text-slate-500">暂未开放</p>
        </section>
      </div>

      <div className={styles.apiStats}>
        <div className={`${glass.inset} ${styles.stat}`}><p className="flex items-center gap-2 text-xs text-slate-500"><WalletCards className="h-4 w-4 text-primary" aria-hidden="true" />账户余额</p><Link href="/account" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline">查看余额<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link><p className="mt-2 text-xs text-slate-400">以账户概览为准</p></div>
        {[
          { label: "今日调用", icon: Activity },
          { label: "今日成功率", icon: ShieldCheck },
          { label: "今日 API 订单", icon: ReceiptText },
          { label: "今日成交", icon: WalletCards },
        ].map(({ label, icon: Icon }) => <div key={label} className={`${glass.inset} ${styles.stat}`}><p className="flex items-center gap-2 text-xs text-slate-500"><Icon className="h-4 w-4 text-primary" aria-hidden="true" />{label}</p><p className="mt-3 text-2xl font-semibold text-slate-400">/</p><p className="mt-2 text-xs text-slate-400">暂未开放</p></div>)}
      </div>

      <div className={styles.apiTabs} role="tablist" aria-label="API 接口管理">
        {tabs.map((tab, index) => <button key={tab.value} ref={(node) => { tabRefs.current[index] = node; }} type="button" role="tab" id={`account-api-tab-${tab.value}`} aria-controls={`account-api-panel-${tab.value}`} aria-selected={activeTab === tab.value} tabIndex={activeTab === tab.value ? 0 : -1} className={`${styles.apiTab} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`} onClick={() => setActiveTab(tab.value)} onKeyDown={(event) => {
          let next: number;
          if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
          else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = tabs.length - 1;
          else return;
          event.preventDefault(); setActiveTab(tabs[next].value); tabRefs.current[next]?.focus();
        }}>{tab.label}</button>)}
      </div>

      <div role="tabpanel" id={`account-api-panel-${activeTab}`} aria-labelledby={`account-api-tab-${activeTab}`} tabIndex={0} className="min-w-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {activeTab === "overview" ? <div className="grid min-w-0 gap-4 xl:grid-cols-2"><UnavailableSection title="最近调用" icon={Activity} columns={["接口", "状态", "时间"]} message="接口调用暂未开放" /><UnavailableSection title="最近 API 订单" icon={ReceiptText} columns={["商品", "金额", "状态"]} message="API 订单暂未开放" /></div>
          : activeTab === "calls" ? <UnavailableSection title="调用记录" icon={Activity} columns={["接口", "状态", "时间"]} message="调用记录暂未开放" />
          : activeTab === "orders" ? <UnavailableSection title="API 订单" icon={ReceiptText} columns={["商品", "金额", "状态"]} message="API 订单暂未开放" />
          : <UnavailableSection title="安全设置" icon={ShieldCheck} message="API 安全设置暂未开放" />}
      </div>
    </div>
  );
}

function UnavailableSection({ title, icon: Icon, columns, message }: { title: string; icon: LucideIcon; columns?: string[]; message: string }) {
  return <section className={`${glass.surface} ${styles.panel} overflow-hidden`}>
    <h2 className="flex items-center gap-2 px-6 py-5 text-base font-semibold"><Icon className="h-4 w-4 text-primary" aria-hidden="true" />{title}</h2>
    {columns ? <table className={styles.apiTable} aria-label={title}><thead><tr>{columns.map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead><tbody><tr><td colSpan={columns.length}><UnavailableContent icon={Icon} message={message} /></td></tr></tbody></table> : <UnavailableContent icon={Icon} message={message} />}
  </section>;
}

function UnavailableContent({ icon: Icon, message }: { icon: LucideIcon; message: string }) {
  return <div className={styles.apiEmpty}><span className={`${glass.icon} mb-4 h-12 w-12`}><Icon className="h-6 w-6" strokeWidth={1.3} aria-hidden="true" /></span><p className="text-sm font-medium text-slate-500">{message}</p></div>;
}
