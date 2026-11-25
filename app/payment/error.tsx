"use client";

import { RouteErrorView } from "@/components/layout/RouteStateView";

export default function PaymentError({
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
      title="支付页面暂时异常"
      description="如果已完成付款，请勿重复支付，可重试刷新或前往「我的订单」核对状态。"
      homeHref="/account/orders"
      homeLabel="查看我的订单"
    />
  );
}
