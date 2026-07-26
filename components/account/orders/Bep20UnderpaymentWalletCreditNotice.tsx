import { ExternalLink, ShieldCheck } from "lucide-react";

import type { Bep20UnderpaymentWalletCreditSummary } from "@/lib/orders/order-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function formatDate(value: string) {
  const time = Date.parse(value);
  return Number.isFinite(time)
    ? new Date(time).toLocaleString("zh-CN", { hour12: false })
    : "—";
}

export function Bep20UnderpaymentWalletCreditNotice({
  summary,
  submittedTxHash,
}: {
  summary: Bep20UnderpaymentWalletCreditSummary | null | undefined;
  submittedTxHash?: string | null;
}) {
  if (!summary) return null;
  const txHashValid = /^0x[0-9a-fA-F]{64}$/.test(submittedTxHash ?? "");

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold text-slate-950">
          <ShieldCheck className="h-4 w-4 text-primary" />
          历史链上支付信息
        </div>
        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
          欠额已转余额
        </Badge>
      </div>
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
        实际到账金额已按本订单冻结汇率转入站内余额，原商品订单已取消，不会继续履约或交付。
      </p>
      <div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
        <Info label="实收 USDT" value={summary.received_usdt} />
        <Info label="应付 USDT" value={summary.expected_usdt} />
        <Info label="欠额 USDT" value={summary.shortfall_usdt} />
        <Info label="冻结汇率" value={summary.exchange_rate} />
        <Info label="转入人民币余额" value={`¥${summary.credited_cny}`} />
        <Info label="处理时间" value={formatDate(summary.processed_at)} />
        <Info label="链上交易" value={summary.tx_hash_summary ?? "—"} />
      </div>
      {txHashValid ? (
        <Button asChild size="sm" variant="outline">
          <a href={`https://bscscan.com/tx/${submittedTxHash}`} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            查看链上交易
          </a>
        </Button>
      ) : null}
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
