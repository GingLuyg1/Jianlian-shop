"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, RefreshCcw, X } from "lucide-react";
import { toast } from "sonner";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/i18n/datetime";
import { canSubmitAdminUnderpaymentSettlement } from "@/lib/payments/bep20-underpayment-admin-runtime.mjs";

type UnderpaymentPreview = {
  sessionId: string;
  sessionIdSummary: string;
  orderId: string;
  orderNo: string;
  userIdSummary: string;
  expectedUsdt: string;
  receivedUsdt: string;
  shortfallUsdt: string;
  exchangeRate: string;
  creditedCny: string;
  balanceBefore: string;
  balanceAfter: string;
  orderStatus: string;
  orderPaymentStatus: string;
  paymentSessionStatus: string;
  chainSessionStatus: string;
  confirmationCount: number | null;
  requiredConfirmations: number;
  confirmedAt: string | null;
  expiresAt: string | null;
  txHash: string | null;
  txHashSummary: string | null;
  chainId: number | null;
  tokenContractSummary: string | null;
  receiveAddressSummary: string | null;
  blockTimestamp: string | null;
  evidenceCreatedAt: string | null;
  inventoryState: { reservedCount: number; released: boolean };
  dispositionState: {
    exists: boolean;
    disposition: string | null;
    processedAt: string | null;
    transactionNo: string | null;
    requestId: string | null;
  };
  claimCount: number;
  transactionCount: number;
  eligible: boolean;
  blockingReasons: string[];
  expectedResult: "wallet_credit_and_cancel" | "already_settled" | "blocked";
  idempotencyState: "not_settled" | "already_settled";
};

type ListResponse = {
  success?: boolean;
  records?: UnderpaymentPreview[];
  message?: string;
};

type PreviewResponse = {
  success?: boolean;
  eligible?: boolean;
  preview?: UnderpaymentPreview;
  message?: string;
};

type SettlementResponse = {
  success?: boolean;
  result?: "settled" | "already_settled";
  idempotent?: boolean;
  settlement?: Record<string, unknown>;
  code?: string;
  message?: string;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return Number.isNaN(Date.parse(value)) ? "—" : formatDateTime(value);
}

function requestIdFor(sessionId: string) {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `manual-underpayment:${sessionId}:${random}`;
}

export default function AdminBep20UnderpaymentPanel() {
  const [records, setRecords] = useState<UnderpaymentPreview[]>([]);
  const [selected, setSelected] = useState<UnderpaymentPreview | null>(null);
  const [prechecked, setPrechecked] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmationText, setConfirmationText] = useState("");
  const [irreversible, setIrreversible] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState("");

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/payments/bep20/underpayments?limit=100", {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as ListResponse | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message ?? "欠额支付记录加载失败");
      }
      setRecords(payload.records ?? []);
    } catch (loadError) {
      setRecords([]);
      setError(loadError instanceof Error ? loadError.message : "欠额支付记录加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const openRecord = (record: UnderpaymentPreview) => {
    setSelected(record);
    setPrechecked(false);
    setReason("");
    setConfirmationText("");
    setIrreversible(false);
    setRequestId(requestIdFor(record.sessionId));
  };

  const runPrecheck = async () => {
    if (!selected) return;
    setChecking(true);
    setPrechecked(false);
    try {
      const response = await fetch(
        `/api/admin/payments/bep20/underpayments?session_id=${encodeURIComponent(selected.sessionId)}`,
        { cache: "no-store" },
      );
      const payload = await response.json().catch(() => null) as PreviewResponse | null;
      if (!response.ok || !payload?.success || !payload.preview) {
        throw new Error(payload?.message ?? "只读预检查失败");
      }
      setSelected(payload.preview);
      setPrechecked(true);
      if (payload.preview.eligible) toast.success("只读预检查通过");
      else toast.error("只读预检查发现阻断项");
    } catch (precheckError) {
      toast.error(precheckError instanceof Error ? precheckError.message : "只读预检查失败");
    } finally {
      setChecking(false);
    }
  };

  const canSettle = useMemo(() => Boolean(selected) && canSubmitAdminUnderpaymentSettlement({
    previewed: prechecked,
    eligible: Boolean(selected?.eligible),
    reason: reason.length <= 500 ? reason : "",
    confirmationText,
    orderNo: selected?.orderNo,
    irreversibleConfirmed: irreversible,
    submitting: settling,
  }), [confirmationText, irreversible, prechecked, reason, selected, settling]);

  const settle = async () => {
    if (!selected || !canSettle) return;
    const confirmed = window.confirm(
      `不可撤销操作：将订单 ${selected.orderNo} 的实收欠额款折算为余额，并取消原订单。是否继续？`,
    );
    if (!confirmed) return;

    setSettling(true);
    try {
      const response = await fetch("/api/admin/payments/bep20/underpayments/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "settle",
          dry_run: false,
          sessionId: selected.sessionId,
          reason: reason.trim(),
          requestId,
          requiredConfirmations: selected.requiredConfirmations,
          confirmationText: confirmationText.trim(),
          confirmIrreversible: true,
        }),
      });
      const payload = await response.json().catch(() => null) as SettlementResponse | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message ?? "欠额支付结算失败");
      }
      toast.success(
        payload.result === "already_settled"
          ? "该欠额记录已完成结算，本次未重复入账"
          : "欠额款已转入用户余额，原订单已取消",
      );
      setPrechecked(false);
      await loadRecords();
      const previewResponse = await fetch(
        `/api/admin/payments/bep20/underpayments?session_id=${encodeURIComponent(selected.sessionId)}`,
        { cache: "no-store" },
      );
      const previewPayload = await previewResponse.json().catch(() => null) as PreviewResponse | null;
      if (previewResponse.ok && previewPayload?.preview) setSelected(previewPayload.preview);
    } catch (settlementError) {
      toast.error(settlementError instanceof Error ? settlementError.message : "欠额支付结算失败");
    } finally {
      setSettling(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <div className="font-semibold text-slate-950">BEP20 欠额转余额</div>
          <p className="mt-1 text-xs text-slate-500">仅超级管理员可查看和执行；结算前必须完成只读预检查。</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadRecords()} disabled={loading}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          刷新
        </Button>
      </div>

      {error ? (
        <div className="min-h-0 flex-1 p-4">
          <AdminErrorState description={error} onRetry={loadRecords} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[1680px] text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-500">
              <tr className="border-b">
                {["订单号", "会话", "用户", "应付 USDT", "实收 USDT", "欠额 USDT", "冻结汇率", "预计 CNY", "订单", "支付会话", "链会话", "确认数", "确认时间", "截止时间", "TxHash", "处置", "资格", "操作"].map((label) => (
                  <th key={label} className="whitespace-nowrap px-3 py-3 text-left font-medium">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={18} className="h-40 px-4 text-center text-slate-500">正在加载欠额记录…</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={18} className="h-[360px] px-4"><AdminEmptyState title="暂无可显示的欠额记录" description="当前没有 underpaid 链上会话。" /></td></tr>
              ) : records.map((record) => (
                <tr key={record.sessionId} className="border-b hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-xs">{record.orderNo || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-xs">{record.sessionIdSummary}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-xs">{record.userIdSummary}</td>
                  <td className="px-3 py-3">{record.expectedUsdt}</td>
                  <td className="px-3 py-3">{record.receivedUsdt}</td>
                  <td className="px-3 py-3 text-amber-700">{record.shortfallUsdt}</td>
                  <td className="px-3 py-3">{record.exchangeRate}</td>
                  <td className="px-3 py-3 font-medium text-emerald-700">¥{record.creditedCny}</td>
                  <td className="px-3 py-3">{record.orderStatus}</td>
                  <td className="px-3 py-3">{record.paymentSessionStatus}</td>
                  <td className="px-3 py-3">{record.chainSessionStatus}</td>
                  <td className="px-3 py-3">{record.confirmationCount ?? "—"} / {record.requiredConfirmations}</td>
                  <td className="whitespace-nowrap px-3 py-3">{formatDate(record.confirmedAt)}</td>
                  <td className="whitespace-nowrap px-3 py-3">{formatDate(record.expiresAt)}</td>
                  <td className="px-3 py-3 font-mono text-xs">{record.txHashSummary ?? "—"}</td>
                  <td className="px-3 py-3">{record.dispositionState.exists ? "已处置" : "未处置"}</td>
                  <td className="px-3 py-3">
                    <Badge variant="outline" className={record.eligible ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
                      {record.eligible ? "可预检" : "需核对"}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    <Button variant="outline" size="sm" onClick={() => openRecord(record)}>
                      <Eye className="mr-1 h-3.5 w-3.5" />查看详情
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected ? (
        <div className="fixed inset-0 z-50 bg-slate-950/30" onClick={() => !settling && setSelected(null)}>
          <aside className="absolute inset-y-0 right-0 flex h-dvh w-full max-w-[820px] flex-col overflow-hidden bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex shrink-0 items-start justify-between border-b px-5 py-4">
              <div>
                <div className="text-lg font-semibold">欠额支付处理</div>
                <div className="mt-1 font-mono text-xs text-slate-500">{selected.orderNo} · {selected.sessionIdSummary}</div>
              </div>
              <Button variant="ghost" size="icon" disabled={settling} onClick={() => setSelected(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              {selected.dispositionState.exists ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  <div className="font-semibold">欠额款已转入用户余额，原订单已取消</div>
                  <div className="mt-1">流水：{selected.dispositionState.transactionNo ?? "—"} · {formatDate(selected.dispositionState.processedAt)}</div>
                </div>
              ) : null}

              <DetailSection title="金额计算" rows={[
                ["应付 USDT", selected.expectedUsdt],
                ["实收 USDT", selected.receivedUsdt],
                ["欠额 USDT", selected.shortfallUsdt],
                ["冻结汇率", selected.exchangeRate],
                ["预计转入 CNY", `¥${selected.creditedCny}`],
                ["当前余额", `¥${selected.balanceBefore}`],
                ["预计结算后余额", `¥${selected.balanceAfter}`],
              ]} />
              <DetailSection title="链上证据" rows={[
                ["TxHash", selected.txHashSummary ?? "—"],
                ["Chain ID", selected.chainId == null ? "—" : String(selected.chainId)],
                ["USDT 合约", selected.tokenContractSummary ?? "—"],
                ["收款地址", selected.receiveAddressSummary ?? "—"],
                ["确认数", `${selected.confirmationCount ?? "—"} / ${selected.requiredConfirmations}`],
                ["区块时间", formatDate(selected.blockTimestamp)],
                ["证据写入时间", formatDate(selected.evidenceCreatedAt)],
                ["确认时间", formatDate(selected.confirmedAt)],
                ["Claim / Transaction", `${selected.claimCount} / ${selected.transactionCount}`],
              ]} />
              <DetailSection title="状态与库存" rows={[
                ["订单状态", selected.orderStatus],
                ["订单支付状态", selected.orderPaymentStatus],
                ["支付会话状态", selected.paymentSessionStatus],
                ["链会话状态", selected.chainSessionStatus],
                ["截止时间", formatDate(selected.expiresAt)],
                ["预留数字库存", String(selected.inventoryState.reservedCount)],
                ["库存已释放", selected.inventoryState.released ? "是" : "否"],
                ["处置状态", selected.idempotencyState === "already_settled" ? "已结算" : "未结算"],
              ]} />

              <div className="rounded-xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">只读预检查</div>
                    <p className="mt-1 text-xs text-slate-500">不会修改余额、流水、处置记录、订单、库存或确认时间。</p>
                  </div>
                  <Button variant="outline" onClick={() => void runPrecheck()} disabled={checking || settling}>
                    {checking ? "检查中…" : "运行只读预检查"}
                  </Button>
                </div>
                {prechecked ? (
                  <div className={`mt-3 rounded-lg p-3 text-sm ${selected.eligible ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                    <div className="flex items-center gap-2 font-medium">
                      {selected.eligible ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                      {selected.eligible ? "预检查通过" : "预检查未通过"}
                    </div>
                    {selected.blockingReasons.length ? (
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {selected.blockingReasons.map((reasonText) => <li key={reasonText}>{reasonText}</li>)}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="space-y-3 rounded-xl border border-red-200 bg-red-50/40 p-4">
                <div className="font-semibold text-red-800">不可撤销人工结算</div>
                <div>
                  <label className="text-sm font-medium">处理原因（1–500 字）</label>
                  <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} className="mt-1 min-h-[88px] w-full rounded-md border bg-white px-3 py-2 text-sm" disabled={settling} />
                </div>
                <div>
                  <label className="text-sm font-medium">输入完整订单号确认</label>
                  <Input value={confirmationText} onChange={(event) => setConfirmationText(event.target.value)} placeholder={selected.orderNo} disabled={settling} />
                </div>
                <label className="flex items-start gap-3 text-sm">
                  <Checkbox checked={irreversible} onCheckedChange={(value) => setIrreversible(value === true)} disabled={settling} />
                  <span>确认将实收金额折算为余额并取消原订单；该操作不可撤销。</span>
                </label>
                <Button variant="destructive" className="w-full" disabled={!canSettle} onClick={() => void settle()}>
                  {settling ? "处理中，请勿重复提交…" : "将欠额款转入余额并取消原订单"}
                </Button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function DetailSection({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <section className="rounded-xl border">
      <div className="border-b px-4 py-3 font-semibold">{title}</div>
      <div className="grid gap-px bg-slate-100 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="bg-white px-4 py-3 text-sm">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="mt-1 break-all font-medium text-slate-900">{value || "—"}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
