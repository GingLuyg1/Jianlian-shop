"use client";

import { RouteErrorView } from "@/components/layout/RouteStateView";

export default function CheckoutError({
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
      title="结算页加载异常"
      description="商品结算信息读取中断，您可以重新加载或返回商品目录继续选购。"
      homeHref="/products/digital-accounts"
      homeLabel="返回商品目录"
    />
  );
}
