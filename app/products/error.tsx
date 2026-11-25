"use client";

import { RouteErrorView } from "@/components/layout/RouteStateView";

export default function ProductsError({
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
      title="商品页面加载异常"
      description="商品目录或详情渲染遇到异常，请点击重新加载或返回首页。"
    />
  );
}
