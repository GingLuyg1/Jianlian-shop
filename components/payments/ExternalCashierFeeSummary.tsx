import { estimateExternalBuyerFee } from "@/lib/payments/online-payment-policy.mjs";

// Informational only: this never supplies amounts to a create request or RPC.
export default function ExternalCashierFeeSummary({ principal, provider, currency }: {
  principal: number | string; provider?: string; currency?: string;
}) {
  if (currency !== "CNY" || !["snpay", "liuhaoyi"].includes(provider ?? "")) return null;
  const estimate = estimateExternalBuyerFee(principal);
  if (!estimate) return null;
  return <div className="mt-2 text-xs leading-5 text-amber-800" data-external-cashier-fee>
    <div>本站本金/商品金额：¥{estimate.principal}；本站手续费：¥0.00</div>
    <div>支付平台买家手续费约 3%：约 ¥{estimate.buyerFeeEstimate}；收银台付款总额约 ¥{estimate.cashierTotalEstimate}</div>
    <div>实际付款金额以支付页面为准。额外费用不增加充值本金、到账金额或商品金额；上游结算成本不是本站手续费。</div>
  </div>;
}
