"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clipboard, ExternalLink, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getOrderErrorMessage } from "@/lib/orders/order-queries";
import {
  getBep20PaymentAction,
  getBep20PaymentNotice,
  normalizeOrderStatus,
  normalizePaymentStatus,
} from "@/lib/orders/order-status";
import type { OrderRecord } from "@/lib/orders/order-types";
import { cn } from "@/lib/utils";

type Bep20PaymentAction =
  | "continue_active_payment"
  | "renew_payment_session"
  | "submit_late_transaction"
  | "view_status"
  | "rejected"
  | "paid"
  | "closed";

type Bep20Session = {
  chainSessionId: string | null;
  orderNo: string;
  network: string;
  expectedAmount: string;
  receiveAddress: string;
  expiresAt: string;
  status: string;
  submittedTxHash: string | null;
  prefillSubmittedTxHash: boolean;
  paymentAction: Bep20PaymentAction;
  canRenewPaymentSession: boolean;
  canSubmitLateTransaction: boolean;
  requiredConfirmations: number;
  confirmationCount?: number;
  confirmedAmount?: string | null;
  message?: string;
};

type ApiError = {
  error?: string;
  code?: string;
};

function secondsLeft(expiresAt?: string | null) {
  if (!expiresAt) return 0;
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

function formatDuration(seconds: number) {
  if (seconds <= 0) return "已过期";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `剩余 ${minutes} 分 ${remainder} 秒`;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function shortHash(value?: string | null) {
  if (!value) return "—";
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value;
}

function statusCopy(session: Bep20Session | null) {
  if (!session) return { label: "未生成支付单", className: "border-amber-200 bg-amber-50 text-amber-700" };
  if (session.paymentAction === "paid") return { label: "已支付", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (session.paymentAction === "rejected") return { label: "审核已结束", className: "border-slate-200 bg-slate-50 text-slate-600" };
  if (session.canSubmitLateTransaction) return { label: "可提交晚到账", className: "border-amber-200 bg-amber-50 text-amber-700" };
  if (session.status === "manual_review") return { label: "人工审核中", className: "border-blue-200 bg-blue-50 text-blue-700" };
  if (session.status === "confirming") return { label: "确认中", className: "border-blue-200 bg-blue-50 text-blue-700" };
  if (session.status === "underpaid") return { label: "到账金额不足", className: "border-red-200 bg-red-50 text-red-700" };
  if (session.status === "payment_failed") return { label: "支付处理失败", className: "border-red-200 bg-red-50 text-red-700" };
  if (session.paymentAction === "renew_payment_session") return { label: "需重新生成", className: "border-amber-200 bg-amber-50 text-amber-700" };
  return { label: "待支付", className: "border-amber-200 bg-amber-50 text-amber-700" };
}

function noticeForSession(session: Bep20Session | null, order: OrderRecord) {
  const orderAction = getBep20PaymentAction(order);
  const orderNotice = getBep20PaymentNotice(order);

  if (!session) {
    return orderAction?.kind === "renew"
      ? "当前没有有效支付单，你可以重新生成新的支付单。"
      : orderNotice || "正在读取当前支付信息。";
  }
  if (session.paymentAction === "paid") return null;
  if (session.paymentAction === "rejected") return "该支付审核已结束，如有疑问请联系客服。";
  if (session.status === "manual_review") return "链上交易已收到，当前正在人工核验，请勿重复付款。";
  if (session.status === "confirming") return "链上确认中，请勿重复付款。";
  if (session.canSubmitLateTransaction) {
    return "原支付会话已过期。如果你已经完成转账，可以提交原交易哈希进行人工核验；请不要再次转账。";
  }
  if (session.paymentAction === "renew_payment_session") {
    return "当前没有有效支付单，你可以重新生成新的支付单。";
  }
  if (session.status === "underpaid") return "到账金额不足，不能按足额支付处理。";
  if (session.status === "payment_failed") return "支付处理失败，请提交原订单支付凭证或联系客服。";
  return "当前有有效支付信息，请仅通过 BNB Smart Chain (BEP20) 转账。";
}

function DetailRow({
  label,
  value,
  copyValue,
  strong,
}: {
  label: string;
  value: string;
  copyValue?: string | null;
  strong?: boolean;
}) {
  async function copy() {
    if (!copyValue) return;
    await navigator.clipboard.writeText(copyValue);
    toast.success("已复制");
  }

  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center justify-end gap-2 text-right">
        <span className={cn("min-w-0 truncate", strong && "font-semibold text-primary")} title={copyValue ?? value}>
          {value}
        </span>
        {copyValue ? (
          <button type="button" onClick={copy} className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`复制${label}`}>
            <Clipboard className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function Bep20OrderPaymentSummary({
  order,
  compact = false,
  onUpdated,
}: {
  order: OrderRecord;
  compact?: boolean;
  onUpdated?: () => void | Promise<void>;
}) {
  const [session, setSession] = useState<Bep20Session | null>(null);
  const [txHash, setTxHash] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [nowTick, setNowTick] = useState(0);
  const [renewConfirmOpen, setRenewConfirmOpen] = useState(false);

  const isBep20Order = String(order.payment_method ?? "").toLowerCase() === "usdt_bep20";
  const status = statusCopy(session);
  const remainingSeconds = secondsLeft(session?.expiresAt) + nowTick * 0;
  const fullPaymentHref = `/payment?order=${encodeURIComponent(order.order_no)}`;
  const txHashValid = /^0x[0-9a-fA-F]{64}$/.test(txHash.trim());
  const submittedTxHashValid = /^0x[0-9a-fA-F]{64}$/.test(session?.submittedTxHash ?? "");
  const orderStatus = normalizeOrderStatus(order.status);
  const paymentStatus = normalizePaymentStatus(order.payment_status);
  const paymentCompleted = paymentStatus === "paid"
    || ["paid", "processing", "delivered", "completed"].includes(orderStatus)
    || session?.status === "paid"
    || session?.paymentAction === "paid";
  const orderClosed = ["cancelled", "failed"].includes(orderStatus)
    || (orderStatus === "expired" && !session?.canSubmitLateTransaction);
  const sessionAllowsTxHash = Boolean(
    session && (session.paymentAction === "continue_active_payment" || session.canSubmitLateTransaction)
  );
  const canSubmitTxHash = !paymentCompleted && !orderClosed && sessionAllowsTxHash;
  const canShowTxInput = canSubmitTxHash;
  const canRenew = orderStatus !== "expired"
    && !paymentCompleted
    && !orderClosed
    && Boolean(session?.canRenewPaymentSession);
  const canOpenOriginalPayment = canSubmitTxHash;
  const notice = useMemo(() => noticeForSession(session, order), [order, session]);

  const loadSession = useCallback(
    async (options: { create?: boolean } = {}) => {
      if (!isBep20Order || loading || creating) return false;
      if (options.create) setCreating(true);
      else setLoading(true);
      setError("");
      try {
        const response = options.create
          ? await fetch("/api/payments/bep20/session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ order: order.order_no }),
            })
          : await fetch(`/api/payments/bep20/session?order=${encodeURIComponent(order.order_no)}`, { cache: "no-store" });
        const result = (await response.json().catch(() => null)) as (Bep20Session & ApiError) | null;
        if (!response.ok) throw new Error(result?.error ?? "支付信息读取失败");
        setSession(result);
        setTxHash(result?.prefillSubmittedTxHash ? result.submittedTxHash ?? "" : "");
        return true;
      } catch (sessionError) {
        setError(getOrderErrorMessage(sessionError, options.create ? "支付单生成失败，请稍后重试" : "支付信息读取失败，请稍后重试"));
        return false;
      } finally {
        setLoading(false);
        setCreating(false);
      }
    },
    [creating, isBep20Order, loading, order.order_no]
  );

  async function confirmRenewPaymentSession() {
    if (!canRenew || creating) return;
    const ok = await loadSession({ create: true });
    if (ok) {
      setRenewConfirmOpen(false);
      await onUpdated?.();
    }
  }

  useEffect(() => {
    if (!isBep20Order) return;
    void loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBep20Order, order.order_no]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function verifyTxHash() {
    if (!session || verifying || !canSubmitTxHash) return;
    setVerifying(true);
    setError("");
    try {
      const response = await fetch("/api/payments/bep20/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order: order.order_no,
          tx_hash: txHash,
          chain_session_id: session.canSubmitLateTransaction ? session.chainSessionId : undefined,
        }),
      });
      const result = (await response.json().catch(() => null)) as (Bep20Session & ApiError) | null;
      if (!response.ok) throw new Error(result?.error ?? "链上交易校验失败");
      setSession(result);
      setTxHash(result?.prefillSubmittedTxHash ? result.submittedTxHash ?? txHash : "");
      await onUpdated?.();
    } catch (verifyError) {
      setError(getOrderErrorMessage(verifyError, "链上交易校验失败，请稍后重试"));
    } finally {
      setVerifying(false);
    }
  }

  if (!isBep20Order) return null;

  return (
    <section className={cn("min-w-0 max-w-full overflow-hidden rounded-xl border border-orange-100 bg-white p-4 text-sm", compact ? "space-y-3" : "space-y-4")}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold text-slate-950">
          <ShieldCheck className="h-4 w-4 text-primary" />
          支付信息
        </div>
        <Badge variant="outline" className={cn("whitespace-nowrap text-xs", status.className)}>
          {loading ? "读取中" : status.label}
        </Badge>
      </div>

      {notice ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 leading-6 text-amber-900">
          {notice}
        </div>
      ) : null}

      {error ? <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-red-700">{error}</div> : null}

      {loading ? (
        <div className="rounded-lg bg-slate-50 px-3 py-4 text-center text-muted-foreground">正在读取支付信息...</div>
      ) : session && session.paymentAction !== "renew_payment_session" ? (
        <div className="space-y-2 rounded-lg bg-slate-50 p-3">
          <DetailRow label="支付网络" value="BNB Smart Chain (BEP20)" />
          <DetailRow label="应付金额" value={`${session.expectedAmount || "—"} USDT`} copyValue={session.expectedAmount || null} strong />
          <DetailRow label="收款地址" value={shortHash(session.receiveAddress)} copyValue={session.receiveAddress} />
          <DetailRow label="支付时效" value={session.canSubmitLateTransaction ? "已过期" : formatDuration(remainingSeconds)} />
          <DetailRow label="确认进度" value={`${session.confirmationCount ?? 0} / ${session.requiredConfirmations} 个区块确认`} />
          {session.submittedTxHash ? <DetailRow label="TxHash" value={shortHash(session.submittedTxHash)} copyValue={session.submittedTxHash} /> : null}
          {session.confirmedAmount ? <DetailRow label="实收金额" value={`${session.confirmedAmount} USDT`} /> : null}
        </div>
      ) : null}

      {canShowTxInput ? (
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-900">交易哈希 TxHash</label>
          <input
            value={txHash}
            onChange={(event) => setTxHash(event.target.value)}
            disabled={!canSubmitTxHash || verifying}
            placeholder="0x 开头的 32 字节交易哈希"
            className="h-10 w-full rounded-lg border border-border bg-white px-3 font-mono text-sm outline-none focus:border-primary disabled:bg-slate-50"
          />
          {txHash && !txHashValid ? <div className="text-xs text-red-600">请输入合法的 0x 开头 64 位十六进制 TxHash。</div> : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {canSubmitTxHash ? (
          <Button type="button" size="sm" onClick={verifyTxHash} disabled={!txHashValid || verifying}>
            {verifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {session?.canSubmitLateTransaction ? "提交人工核验" : "提交链上校验"}
          </Button>
        ) : null}
        {canRenew ? (
          <AlertDialog open={renewConfirmOpen} onOpenChange={(open) => !creating && setRenewConfirmOpen(open)}>
            <Button type="button" size="sm" variant="outline" onClick={() => setRenewConfirmOpen(true)} disabled={creating}>
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              重新生成支付单
            </Button>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认重新生成支付单？</AlertDialogTitle>
                <AlertDialogDescription className="leading-6">
                  重新生成后将创建新的 30 分钟支付会话。请按新支付单显示的金额和信息付款。如果你已经完成原支付单转账，请取消并选择“提交原订单支付凭证”，避免重复付款。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={creating}>取消</AlertDialogCancel>
                <Button type="button" onClick={confirmRenewPaymentSession} disabled={creating}>
                  {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  确认重新生成
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
        {canOpenOriginalPayment ? (
          <Button asChild size="sm" variant="outline">
            <Link href={fullPaymentHref}>
              <ExternalLink className="mr-2 h-4 w-4" />
              提交原订单支付凭证
            </Link>
          </Button>
        ) : null}
        {submittedTxHashValid ? (
          <Button asChild size="sm" variant="outline">
            <a href={`https://bscscan.com/tx/${session?.submittedTxHash}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              查看链上交易
            </a>
          </Button>
        ) : null}
        {session?.paymentAction === "paid" ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            支付已完成
          </span>
        ) : null}
      </div>
    </section>
  );
}
