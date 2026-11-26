"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  AlertOctagon,
  Clock,
  Database,
  GitCompareArrows,
  Search,
  ShieldAlert,
  Wrench,
} from "lucide-react";

import OperationsReadonlyWorkspace from "@/components/admin/OperationsReadonlyWorkspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const tabLoading = () => (
  <div className="p-6 text-sm text-[var(--admin-v2-text-muted)]">正在加载运维模块...</div>
);

const ProductionReadinessClient = dynamic(
  () => import("@/components/admin/system/ProductionReadinessClient"),
  { loading: tabLoading }
);
const AdminSystemErrorsPage = dynamic(
  () => import("@/app/admin/system-errors/page"),
  { loading: tabLoading }
);
const AdminRiskPage = dynamic(
  () => import("@/app/admin/risk/page"),
  { loading: tabLoading }
);
const DataConsistencyClient = dynamic(
  () => import("@/components/admin/system/DataConsistencyClient"),
  { loading: tabLoading }
);
const AdminCompensationsPage = dynamic(
  () => import("@/app/admin/system/compensations/page"),
  { loading: tabLoading }
);
const DatabaseStatusClient = dynamic(
  () => import("@/components/admin/system/DatabaseStatusClient"),
  { loading: tabLoading }
);

const TOOLBOX_TABS = [
  { key: "production", label: "生产看板", icon: Activity },
  { key: "errors", label: "异常中心", icon: AlertOctagon },
  { key: "risk", label: "风险监控", icon: ShieldAlert },
  { key: "consistency", label: "数据一致性", icon: GitCompareArrows },
  { key: "compensations", label: "事务补偿", icon: Wrench },
  { key: "workers", label: "定时任务", icon: Clock },
  { key: "database", label: "数据库状态", icon: Database },
] as const;

type ToolboxTabKey = (typeof TOOLBOX_TABS)[number]["key"];
const VALID_TABS = new Set<string>(TOOLBOX_TABS.map((t) => t.key));

export default function AdminSystemToolboxPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<ToolboxTabKey>(
    initialTab && VALID_TABS.has(initialTab) ? (initialTab as ToolboxTabKey) : "production"
  );
  const [traceId, setTraceId] = useState("");

  useEffect(() => {
    const param = searchParams.get("tab");
    if (param && VALID_TABS.has(param)) {
      setActiveTab(param as ToolboxTabKey);
    }
  }, [searchParams]);

  function selectTab(next: ToolboxTabKey) {
    setActiveTab(next);
    router.replace(`/admin/system/toolbox?tab=${next}`, { scroll: false });
  }

  function jumpTrace(event: React.FormEvent) {
    event.preventDefault();
    const cleaned = traceId.trim();
    if (!cleaned) return;
    router.push(`/admin/system/request-traces/${encodeURIComponent(cleaned)}`);
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-[var(--admin-v2-border)] bg-[var(--admin-v2-surface)] px-4 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="运维排障工具箱">
            {TOOLBOX_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => selectTab(tab.key)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-[var(--admin-v2-control-radius)] px-2.5 text-xs font-medium transition-colors whitespace-nowrap",
                    active
                      ? "bg-[var(--admin-v2-selected)] text-[var(--admin-v2-primary)] ring-1 ring-blue-200/80"
                      : "text-[var(--admin-v2-text-secondary)] hover:bg-[var(--admin-v2-surface-muted)] hover:text-[var(--admin-v2-text-primary)]"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {tab.label}
                </button>
              );
            })}
          </div>
          <form onSubmit={jumpTrace} className="flex items-center gap-1.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={traceId}
                onChange={(e) => setTraceId(e.target.value)}
                placeholder="粘贴 Request ID 查链路"
                aria-label="请求追踪编号"
                className="h-8 w-44 pl-8 text-xs"
              />
            </div>
            <Button type="submit" size="sm" variant="outline" className="h-8 px-2.5 text-xs" disabled={!traceId.trim()}>
              追踪
            </Button>
          </form>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {activeTab === "production" ? <ProductionReadinessClient /> : null}
        {activeTab === "errors" ? <AdminSystemErrorsPage /> : null}
        {activeTab === "risk" ? <AdminRiskPage /> : null}
        {activeTab === "consistency" ? <DataConsistencyClient /> : null}
        {activeTab === "compensations" ? <AdminCompensationsPage /> : null}
        {activeTab === "workers" ? <OperationsReadonlyWorkspace kind="worker" /> : null}
        {activeTab === "database" ? <DatabaseStatusClient /> : null}
      </div>
    </div>
  );
}
