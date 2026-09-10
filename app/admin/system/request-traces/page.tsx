"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminSection from "@/components/admin/v2/AdminSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,119}$/;

export default function AdminRequestTraceSearchPage() {
  const router = useRouter();
  const [requestId, setRequestId] = useState("");
  const [error, setError] = useState("");

  function submit() {
    const value = requestId.trim();
    if (!REQUEST_ID_PATTERN.test(value)) {
      setError("请输入有效的 Request ID。");
      return;
    }
    router.push(`/admin/system/request-traces/${encodeURIComponent(value)}`);
  }

  return (
    <AdminPageShell
      variant="v2"
      title="请求追踪"
      description="根据 Request ID 汇总系统异常、审计日志和业务事件，用于定位慢请求和线上故障。"
    >
      <AdminSection title="查询 Request ID" description="输入完整请求编号，进入跨模块只读链路详情。" className="max-w-3xl">
        <div className="space-y-4 px-4 pb-4 sm:px-5 sm:pb-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={requestId}
              onChange={(event) => {
                setRequestId(event.target.value);
                setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
              placeholder="例如 req_xxxxxxxx"
              aria-label="Request ID"
              className="h-11 rounded-[var(--admin-v2-control-radius)] border-[var(--admin-v2-border)] font-mono sm:h-9"
            />
            <Button type="button" onClick={submit} className="h-11 sm:h-9">
              <Search className="mr-2 h-4 w-4" />
              查询
            </Button>
          </div>
          {error ? <div role="alert" className="text-sm text-[var(--admin-v2-danger-foreground)]">{error}</div> : null}
          <div className="rounded-[var(--admin-v2-control-radius)] bg-[var(--admin-v2-surface-muted)] px-4 py-3 text-sm text-[var(--admin-v2-text-secondary)]">
            Request ID 只用于内部排查，不会展示密钥、卡密、Token 或完整支付回调原文。
          </div>
        </div>
      </AdminSection>
    </AdminPageShell>
  );
}
