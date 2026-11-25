"use client";

import { RouteErrorView } from "@/components/layout/RouteStateView";

export default function AccountError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorView
      error={error}
      reset={reset}
      title="个人中心加载异常"
      description="账户数据读取暂时中断，请点击重试或返回首页。"
    />
  );
}
