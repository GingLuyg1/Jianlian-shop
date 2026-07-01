"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import AdminPageShell from "@/components/admin/AdminPageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      title="请求追踪"
      description="根据 Request ID 汇总系统异常、审计日志和业务事件，辅助定位慢请求和线上故障。"
    >
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>查询 Request ID</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
              className="font-mono"
            />
            <Button type="button" onClick={submit}>
              <Search className="mr-2 h-4 w-4" />
              查询
            </Button>
          </div>
          {error ? <div className="text-sm text-red-600">{error}</div> : null}
          <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
            Request ID 只用于内部排查，不会展示密钥、卡密、Token 或完整支付回调原文。
          </div>
        </CardContent>
      </Card>
    </AdminPageShell>
  );
}
