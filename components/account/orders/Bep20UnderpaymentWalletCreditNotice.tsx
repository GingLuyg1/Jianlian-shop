import { WalletCards } from "lucide-react";

import type { Bep20UnderpaymentWalletCreditSummary } from "@/lib/orders/order-types";

function formatDate(value: string) {
  const time = Date.parse(value);
  return Number.isFinite(time)
    ? new Date(time).toLocaleString("zh-CN", { hour12: false })
    : "—";
}

export function Bep20UnderpaymentWalletCreditNotice({
  summary,
}: {
  summary: Bep20UnderpaymentWalletCreditSummary | null | undefined;
}) {
  if (!summary) return null;

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
      <div className="flex items-center gap-2 font-semibold">
        <WalletCards className="h-4 w-4" />
        欠额支付已转入账户余额
      </div>
      <p className="mt-2 text-emerald-800">原商品订单已取消，不会继续履约或交付。</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Info label="实收 USDT" value={summary.received_usdt} />
        <Info label="应付 USDT" value={summary.expected_usdt} />
        <Info label="欠额 USDT" value={summary.shortfall_usdt} />
        <Info label="冻结汇率" value={summary.exchange_rate} />
        <Info label="转入人民币余额" value={`¥${summary.credited_cny}`} />
        <Info label="处理时间" value={formatDate(summary.processed_at)} />
        <Info label="余额流水编号" value={summary.transaction_no ?? "—"} />
        <Info label="链上交易" value={summary.tx_hash_summary ?? "—"} />
      </div>
    </section>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-emerald-100 bg-white/70 px-3 py-2">
      <div className="text-xs text-emerald-700">{label}</div>
      <div className="mt-1 break-all font-medium">{value}</div>
    </div>
  );
}
