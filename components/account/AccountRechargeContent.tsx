"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Headphones, Info, Wallet, WalletCards, Check, Clock3, Coins, FileText, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  calculateRechargeAmounts,
  formatPaymentAmount,
} from "@/lib/payments/channels";
import type { PaymentChannel, PaymentChannelCode, PaymentCurrency, PaymentSubmitForm } from "@/lib/payments/channel-types";
import { submitPaymentForm } from "@/lib/payments/submit-payment-form.mjs";
import {
  canContinueLiuhaoyiRechargePayment,
  isRechargePastDue,
} from "@/lib/payments/recharge-expiry.mjs";
import {
  rechargeStatusLabel,
  type RechargeRecord,
} from "@/lib/payments/recharge-utils";
import {
  calculateExpectedUsdtAmount,
  compareRechargeDecimals,
  parseRequestedCnyAmount,
} from "@/lib/payments/recharge-rate.mjs";
import { cn } from "@/lib/utils";
import { openPublicSupport } from "@/lib/support/open-public-support";
import { estimateExternalBuyerFee } from "@/lib/payments/online-payment-policy.mjs";
import RechargeEmptyState from "@/components/account/RechargeEmptyState";
import RecordLoginState from "@/components/account/RecordLoginState";
import { loadPublicRechargeChannels, peekPublicRechargeChannels } from "@/lib/catalog/public-recharge-channels";
import { publicMainPanelHeightClassName } from "@/components/layout/public-content";
import BalanceTransactionRecords from "@/components/account/BalanceTransactionRecords";
import RechargeRecordTabs from "@/components/account/RechargeRecordTabs";
import RechargeWalletIllustration from "@/components/account/RechargeWalletIllustration";
import RecordLoadingPlaceholder from "@/components/account/RecordLoadingPlaceholder";
import { accountRecordPreload, AccountRecordsError } from "@/lib/account/record-preload";
import { useAccountRecordIdentity } from "@/hooks/use-account-record-identity";
import channelGridStyles from "./RechargeChannelGrid.module.css";

type RechargeListError = {
  message: string;
  code: string;
  requestId: string;
};

type RechargeRate = {
  effectiveDate: string;
  marketRate: string;
  settlementRate: string;
  source: string;
  effectiveAt: string;
};

const CHANNEL_PRESENTATION = [
  { code: "alipay", name: "支付宝", description: "手续费 3%", icon: "/assets/alipay-icon.jpg" },
  { code: "wechat", name: "微信支付", description: "手续费 3%", icon: "/assets/wechat-pay-icon.jpg" },
  { code: "usdt_bep20", name: "USDT BEP20", description: "无手续费", icon: "/assets/usdt-bep20-icon.jpg" },
] as const;

export default function AccountRechargeContent() {
  const router = useRouter();
  const recordIdentity = useAccountRecordIdentity();
  const [paymentChannels, setPaymentChannels] = useState<PaymentChannel[]>(() => peekPublicRechargeChannels() ?? []);
  const [selectedChannelCode, setSelectedChannelCode] = useState<PaymentChannelCode | null>(() => CHANNEL_PRESENTATION.find((item) => peekPublicRechargeChannels()?.some((channel) => channel.code === item.code))?.code ?? null);
  const [channelsLoading, setChannelsLoading] = useState(() => !peekPublicRechargeChannels());
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [amountText, setAmountText] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const clientRequestIdRef = useRef<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [records, setRecords] = useState<RechargeRecord[]>(() => accountRecordPreload.peek<RechargeRecord>("recharges", 1)?.data ?? []);
  const [recordsLoading, setRecordsLoading] = useState(() => !accountRecordPreload.peek("recharges", 1));
  const [recordViewKey, setRecordViewKey] = useState(() => accountRecordPreload.peek("recharges", 1) ? `${accountRecordPreload.getSnapshot().epoch}:1` : "");
  const recordRequestId = useRef(0);
  const [recordsError, setRecordsError] = useState<RechargeListError | null>(null);
  const [recordPage, setRecordPage] = useState(1);
  const [recordCount, setRecordCount] = useState(() => accountRecordPreload.peek("recharges", 1)?.count ?? 0);
  const [dailyRate, setDailyRate] = useState<RechargeRate | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [rateLoading, setRateLoading] = useState(false);
  const [amountLimitDialogOpen, setAmountLimitDialogOpen] = useState(false);
  const [historyNowTick, setHistoryNowTick] = useState(0);
  const [historyTab, setHistoryTab] = useState<"recharges" | "balance">("recharges");
  const visibleChannels = paymentChannels.filter((channel) => CHANNEL_PRESENTATION.some((item) => item.code === channel.code));

  const selectedChannel =
    visibleChannels.find((channel) => channel.code === selectedChannelCode) ?? visibleChannels[0] ?? null;
  const isUsdtCnyRecharge = selectedChannel?.code === "usdt_bep20";
  const legacyChannelAmount = isUsdtCnyRecharge ? 0 : Number(amountText) || 0;
  const summary = useMemo(
    () => (selectedChannel && !isUsdtCnyRecharge ? calculateRechargeAmounts(selectedChannel, legacyChannelAmount) : null),
    [legacyChannelAmount, isUsdtCnyRecharge, selectedChannel]
  );
  const requestedCnyAmount = isUsdtCnyRecharge ? parseRequestedCnyAmount(amountText) : null;
  const expectedUsdtAmount = requestedCnyAmount && dailyRate
    ? calculateExpectedUsdtAmount(requestedCnyAmount, dailyRate.settlementRate)
    : null;
  const amountSymbol = !selectedChannel || isUsdtCnyRecharge || selectedChannel.currency === "CNY" ? "¥" : "USDT";
  const minimumComparison = expectedUsdtAmount && selectedChannel
    ? compareRechargeDecimals(expectedUsdtAmount, String(selectedChannel.minimumAmount))
    : null;
  const reachesMin = isUsdtCnyRecharge
    ? minimumComparison !== null && minimumComparison >= 0
    : Boolean(selectedChannel && summary && summary.amount >= selectedChannel.minimumAmount);
  const hasValidAmount = isUsdtCnyRecharge
    ? Boolean(requestedCnyAmount && expectedUsdtAmount && dailyRate && reachesMin)
    : Boolean(summary && summary.amount > 0 && reachesMin);
  const maximumAmount = selectedChannel?.maximumAmount;
  const channelOverLimit = Boolean(summary && typeof maximumAmount === "number"
    && Number.isFinite(maximumAmount) && summary.payableAmount > maximumAmount)
    || (isUsdtCnyRecharge && requestedCnyAmount !== null
      && compareRechargeDecimals(requestedCnyAmount, "2000") === 1);
  // Allow the primary button to explain the limit; createRecharge returns
  // before fetch when over-limit. Never silently leave an unusable button.
  const canSubmit = Boolean(selectedChannel?.enabled && hasValidAmount && !isSubmitting);
  const externalBuyerFee = selectedChannel && !isUsdtCnyRecharge && selectedChannel.currency === "CNY"
    && ["snpay", "liuhaoyi"].includes(selectedChannel.provider) && selectedChannel.providerExternalFeeDisclosure
    ? estimateExternalBuyerFee(amountText) : null;
  const summaryReady = Boolean(selectedChannel && (isUsdtCnyRecharge ? requestedCnyAmount && expectedUsdtAmount && dailyRate : summary && summary.amount > 0));
  const feeDisplay = !summaryReady ? "/" : isUsdtCnyRecharge ? "0" : externalBuyerFee && summary?.fee === 0 ? `约 ¥${externalBuyerFee.buyerFeeEstimate}` : summary ? formatPaymentAmount(summary.fee, selectedChannel!.currency) : "/";
  const payableDisplay = !summaryReady ? "/" : isUsdtCnyRecharge ? `${expectedUsdtAmount} USDT` : externalBuyerFee && summary?.fee === 0 ? `约 ¥${externalBuyerFee.cashierTotalEstimate}` : summary ? formatPaymentAmount(summary.payableAmount, selectedChannel!.currency) : "/";
  const arrivalDisplay = !summaryReady ? "/" : isUsdtCnyRecharge ? formatPaymentAmount(Number(requestedCnyAmount), "CNY") : summary ? formatPaymentAmount(summary.arrivalAmount, selectedChannel!.currency) : "/";
  const externalFeeChannel = selectedChannel?.currency === "CNY" && ["snpay", "liuhaoyi"].includes(selectedChannel.provider) && Boolean(selectedChannel.providerExternalFeeDisclosure);
  const feeContractDifference = selectedChannel && (isUsdtCnyRecharge ? selectedChannel.feeRate !== 0 : externalFeeChannel ? selectedChannel.feeRate !== 0 : selectedChannel.feeRate !== 0.03);

  const loadRecords = useCallback(async (page: number, force = false) => {
    const requestId = ++recordRequestId.current;
    if (recordIdentity.status !== "signed-in") return;
    const epoch = recordIdentity.epoch;
    const viewKey = `${epoch}:${page}`;
    const cached = !force && accountRecordPreload.peek<RechargeRecord>("recharges", page);
    setRecordsError(null);
    if (cached) {
      setRecords(cached.data); setRecordCount(cached.count);
      setRecordViewKey(viewKey); setRecordsLoading(false);
      return;
    }
    setRecordsLoading(true);
    try {
      const result = await accountRecordPreload.load<RechargeRecord>("recharges", page, force);
      if (requestId !== recordRequestId.current || accountRecordPreload.getSnapshot().epoch !== epoch) return;
      setRecords(result.data);
      setRecordCount(result.count);
      setRecordViewKey(viewKey);
      setRecordsError(null);
    } catch (cause) {
      if (requestId !== recordRequestId.current || accountRecordPreload.getSnapshot().epoch !== epoch) return;
      const error = cause instanceof AccountRecordsError ? cause : null;
      setRecords([]); setRecordCount(0); setRecordViewKey(viewKey);
      setRecordsError({
        message: error?.status === 503 ? "充值记录服务暂不可用，请稍后重试。" : error?.message ?? "充值记录加载失败，请稍后重试",
        code: error?.code || "RECHARGE_DB_QUERY_FAILED",
        requestId: error?.requestId ?? "未生成",
      });
    } finally {
      if (requestId === recordRequestId.current) setRecordsLoading(false);
    }
  }, [recordIdentity.epoch, recordIdentity.status]);

  useEffect(() => () => { recordRequestId.current++; }, []);

  useEffect(() => {
    let active = true;
    const load = async (initial = false) => {
      if (initial && !peekPublicRechargeChannels()) setChannelsLoading(true);
      setChannelsError(null);
      try {
        const channels = await loadPublicRechargeChannels();
        if (!active) return;
        setPaymentChannels(channels);
        setSelectedChannelCode((current) => current && channels.some((channel) => channel.code === current)
          ? current : CHANNEL_PRESENTATION.find((item) => channels.some((channel) => channel.code === item.code))?.code ?? null);
      } catch (error) {
        if (active) {
          setPaymentChannels([]);
          setSelectedChannelCode(null);
          setChannelsError(getClientErrorMessage(error, "支付渠道加载失败，请稍后重试"));
        }
      } finally {
        if (active) setChannelsLoading(false);
      }
    };
    void load(true);
    const revalidate = () => { if (document.visibilityState === "visible") void load(); };
    const timer = window.setInterval(revalidate, 15_000);
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, []);

  useEffect(() => {
    void loadRecords(recordPage);
  }, [loadRecords, recordPage]);

  useEffect(() => {
    const revalidate = () => {
      if (document.visibilityState === "visible" && recordIdentity.status === "signed-in" && !accountRecordPreload.peek("recharges", recordPage)) void loadRecords(recordPage);
    };
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => { window.removeEventListener("focus", revalidate); document.removeEventListener("visibilitychange", revalidate); };
  }, [loadRecords, recordPage, recordIdentity.status]);

  useEffect(() => {
    const timer = window.setInterval(() => setHistoryNowTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    // A fiat-only or unconfigured form has no exchange-rate calculation to do.
    // Fetch the live rate when an enabled USDT CNY-recharge channel is selected.
    if (!isUsdtCnyRecharge) { setDailyRate(null); setRateError(null); setRateLoading(false); return; }
    let active = true;
    setRateLoading(true); setRateError(null);
    void fetch("/api/recharges/rate", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as { rate?: RechargeRate; error?: string } | null;
        if (!response.ok || !payload?.rate) throw new Error(payload?.error ?? "今日充值汇率读取失败");
        if (active) { setDailyRate(payload.rate); setRateError(null); }
      })
      .catch((error) => { if (active) setRateError(getClientErrorMessage(error, "今日充值汇率读取失败")); })
      .finally(() => { if (active) setRateLoading(false); });
    return () => { active = false; };
  }, [isUsdtCnyRecharge]);

  const updateAmount = (value: string) => {
    setSubmitMessage(null);
    if (selectedChannel) setAmountText(normalizeAmountInput(value, isUsdtCnyRecharge ? "CNY" : selectedChannel.currency));
    clientRequestIdRef.current = null;
  };

  const selectChannel = (channelCode: PaymentChannelCode) => {
    const channel = paymentChannels.find((item) => item.code === channelCode);
    if (!channel || !channel.enabled) return;
    setSelectedChannelCode(channelCode);
    setAmountText("");
    setSubmitMessage(null);
    clientRequestIdRef.current = null;
  };

  const createRecharge = async () => {
    if (!selectedChannel || (!summary && !isUsdtCnyRecharge)) return;
    if (channelOverLimit) {
      setAmountLimitDialogOpen(true);
      return;
    }
    if (!canSubmit) return;
    setIsSubmitting(true);
    setSubmitMessage(null);

    try {
      clientRequestIdRef.current ||= createClientRequestId();
      const response = await fetch("/api/recharges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: selectedChannel.code,
          payment_method: selectedChannel.code,
          amount: isUsdtCnyRecharge ? requestedCnyAmount : amountText,
          currency: isUsdtCnyRecharge ? "CNY" : selectedChannel.currency,
          customer_note: customerNote,
          client_request_id: clientRequestIdRef.current,
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | { error?: string; rechargeNo?: string; paymentType?: string; paymentUrl?: string; submitForm?: PaymentSubmitForm }
        | null;

      if (!response.ok) throw new Error(result?.error ?? "充值下单失败，请稍后重试");

      if (result?.rechargeNo) {
        if (result.submitForm && submitPaymentForm(result.submitForm)) return;
        if (result.paymentType === "redirect" && result.paymentUrl) {
          window.location.assign(result.paymentUrl);
          return;
        }
        router.push(`/payment?recharge=${encodeURIComponent(result.rechargeNo)}`);
        return;
      }

      setSubmitMessage("充值单已创建，等待支付渠道返回。");
    } catch (error) {
      toast.error(getClientErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PublicLayout mobileNavigationUntilLg contentClassName="max-w-none px-4 py-3 md:px-6">
      <div data-testid="recharge-layout" className={cn("mx-auto flex w-full max-w-[1540px] flex-col gap-4 overflow-visible md:min-h-0 md:overflow-hidden", publicMainPanelHeightClassName)}>
            <Card data-testid="recharge-notice-glass" className={cn(channelGridStyles.noticeGlass, "shrink-0 rounded-2xl")}>
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2"><Info className="h-4 w-4 text-primary" /><h2 className="text-[18px] font-semibold leading-6 whitespace-nowrap">充值须知</h2></div>
                  <button type="button" onClick={openPublicSupport} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><Headphones className="h-3.5 w-3.5" /> 在线客服 <ArrowUpRight className="h-3 w-3" /></button>
                </div>
                <div className="mt-4 grid gap-3 text-xs leading-5 text-slate-500 sm:grid-cols-2 xl:grid-cols-4">
                  <Notice icon={FileText} title="可用渠道">{channelsLoading ? "正在读取…" : channelsError ? "读取失败，请稍后重试" : visibleChannels.filter((channel) => channel.enabled && channel.status === "active").map((channel) => ({ alipay: "支付宝", wechat: "微信", usdt_bep20: "USDT" })[channel.code as "alipay" | "wechat" | "usdt_bep20"]).join("/") || "当前暂无可用渠道"}</Notice>
                  <Notice icon={WalletCards} title="到账与异常"><span className="block">付款后以充值订单状态和实际核验结果为准；</span><span className="block">异常订单请凭订单号联系客服。</span></Notice>
                  <Notice icon={Coins} title="单笔限制"><span className="block">按所选渠道的最低及最高金额校验；</span><span className="block">超过 1000 元请联系客服处理。</span></Notice>
                  <Notice icon={Clock3} title="费用说明">手续费：支付宝和微信 3%<br />USDT BEP20 无手续费</Notice>
                </div>
              </CardContent>
            </Card>
        <div className="grid min-w-0 flex-1 gap-4 md:min-h-0 md:grid-cols-[minmax(0,1fr)_minmax(0,calc((100%_-_1rem)/3.1_-_38px))] md:overflow-hidden">
          <div data-testid="recharge-form-panel" className="min-w-0 md:min-h-0 md:overflow-hidden">
            <Card className={cn(channelGridStyles.formGlass, "flex h-full min-w-0 flex-col overflow-hidden rounded-2xl md:overflow-y-auto")}>
              <div className={cn(channelGridStyles.hero, "relative flex min-h-[112px] shrink-0 items-center gap-4 px-5 py-6 sm:px-6")}>
                <span data-testid="recharge-header-icon" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600 ring-1 ring-inset ring-orange-100"><Wallet className="h-6 w-6" strokeWidth={1.7} /></span>
                <div className="relative z-10 min-w-0 sm:pr-32"><h1 className="text-xl font-bold tracking-tight sm:text-2xl">账户充值</h1><p className="mt-1.5 text-xs leading-5 text-slate-500">请选择可用渠道，填写充值金额，付款信息以创建后的充值单为准。</p></div>
                <RechargeWalletIllustration />
              </div>
              <CardContent className={cn(channelGridStyles.container, "flex min-w-0 flex-1 flex-col p-4 sm:p-6")}>

              <h3 className="text-sm font-semibold">选择支付渠道</h3>

              <div className={channelGridStyles.grid}>
                {channelsLoading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-[84px] animate-pulse rounded-xl border bg-slate-100" />
                  ))
                ) : null}
                {!channelsLoading && channelsError ? (
                  <div className="col-span-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {channelsError}
                  </div>
                ) : null}
                {!channelsLoading && CHANNEL_PRESENTATION.map((item) => {
                  const channel = paymentChannels.find((candidate) => candidate.code === item.code);
                  const selected = Boolean(channel && selectedChannel?.code === channel.code);
                  const disabled = !channel || !channel.enabled || channel.status !== "active";
                  const knownExternalFee = channel?.currency === "CNY" && ["snpay", "liuhaoyi"].includes(channel.provider) && Boolean(channel.providerExternalFeeDisclosure);
                  const actualFeeDescription = channel && ((item.code === "usdt_bep20" && channel.feeRate !== 0) || (item.code !== "usdt_bep20" && !knownExternalFee && channel.feeRate !== 0.03))
                    ? `手续费 ${Number((channel.feeRate * 100).toFixed(2))}%` : item.description;

                  return (
                    <button
                      key={item.code}
                      data-payment-channel={item.code}
                      aria-pressed={selected}
                      type="button"
                      disabled={disabled}
                      onClick={() => { if (channel) selectChannel(channel.code); }}
                      className={cn(
                        channelGridStyles.channelCard,
                        "relative flex h-[84px] min-w-0 items-center rounded-xl border border-slate-200/80 bg-white pl-[13px] pr-2.5 text-left transition-colors hover:border-primary/35 disabled:cursor-not-allowed disabled:bg-slate-50/70 disabled:opacity-60",
                        selected &&
                          "border-primary bg-orange-50 ring-1 ring-primary/15"
                      )}
                    >
                      <span className={cn("absolute right-2 top-2 flex h-3.5 w-3.5 items-center justify-center rounded-full border", selected ? "border-orange-500 bg-orange-500 text-white" : "border-slate-300")}>{selected ? <Check className="h-2.5 w-2.5" /> : null}</span>
                      <div className="flex w-full items-center gap-2">
                        <span data-channel-icon className="flex h-[46px] w-[46px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm">
                            <img
                              src={channel?.iconSrc ?? item.icon}
                              alt=""
                              className="h-full w-full rounded-lg object-cover"
                            />
                        </span>
                        <span className="min-w-0">
                          <span className="block whitespace-nowrap text-[14px] font-semibold leading-5 sm:text-[16px] sm:leading-[22px]">
                            {item.name}
                          </span>
                          <span className="mt-1 block whitespace-nowrap text-[12.5px] leading-[18px] text-muted-foreground">
                            {actualFeeDescription}{disabled ? " · 未开放" : ""}
                          </span>
                        </span>
                      </div>
                    </button>
                  );
                })}
                {!channelsLoading ? <button data-payment-channel="unavailable" type="button" disabled className={cn(channelGridStyles.channelCard, "relative flex h-[84px] min-w-0 cursor-not-allowed items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-100/70 pl-[13px] pr-2.5 text-left text-slate-400")}><span className="absolute right-2 top-2 h-3.5 w-3.5 rounded-full border border-slate-300" /><span data-channel-icon className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-slate-200/70"><LockKeyhole className="h-[23px] w-[23px]" /></span><span className="min-w-0"><span className="block whitespace-nowrap text-[14px] font-semibold leading-5 sm:text-[16px] sm:leading-[22px]">暂未开放</span><span className="mt-1 block whitespace-nowrap text-[12.5px] leading-[18px]">敬请期待</span></span></button> : null}
              </div>
              {feeContractDifference ? <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">当前渠道实际费率与本页展示要求不同。下方金额按实时渠道配置计算，最终付款以充值单为准。</p> : null}

              {selectedChannel?.manualPayment ? (
                <div className="order-4 mt-5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-emerald-950">
                      USDT-BEP20 付款信息
                    </h3>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
                      链上自动识别，异常交易进入人工复核
                    </span>
                  </div>

                  <div className="mt-3 grid gap-3 text-sm">
                    <div>
                      <div className="text-xs font-medium text-emerald-800">
                        收款地址
                      </div>
                      <div className="mt-1 break-all rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-xs text-slate-800">
                        {selectedChannel.manualPayment.payment_address}
                      </div>
                    </div>

                    {selectedChannel.manualPayment.token_contract ? (
                      <div>
                        <div className="text-xs font-medium text-emerald-800">
                          Token 合约
                        </div>
                        <div className="mt-1 break-all rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-xs text-slate-800">
                          {selectedChannel.manualPayment.token_contract}
                        </div>
                      </div>
                    ) : null}

                    <div>
                      <div className="text-xs font-medium text-emerald-800">网络</div>
                      <div className="mt-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-slate-800">
                        {selectedChannel.networkLabel === "BSC" ? "BNB Smart Chain (BEP20)" : selectedChannel.networkLabel ?? selectedChannel.network ?? "—"}
                      </div>
                    </div>

                    {selectedChannel.manualPayment.payment_instructions ? (
                      <div>
                        <div className="text-xs font-medium text-emerald-800">
                          付款说明
                        </div>
                        <div className="mt-1 whitespace-pre-wrap rounded-lg border border-emerald-200 bg-white px-3 py-2 leading-6 text-slate-700">
                          {selectedChannel.manualPayment.payment_instructions}
                        </div>
                      </div>
                    ) : null}

                    <p className="text-xs leading-5 text-amber-700">
                      {isUsdtCnyRecharge
                        ? "请严格按充值单最终生成的精确 USDT 金额付款。金额不一致、晚到账或其他异常交易将进入人工复核；匹配成功后按申请的人民币金额入账。"
                        : "请严格核对币种和网络，按实际支付金额足额转账。不要向其他网络或其他合约地址转账。"}
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="order-3 mt-8 flex flex-col border-t border-border/70 pt-6 md:mt-auto md:pt-8">
                <label className="mb-1.5 block text-sm font-medium">
                  <span className="text-red-500">*</span>充值金额
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                    {amountSymbol}
                  </span>
                  <Input
                    value={amountText}
                    inputMode="decimal"
                    onChange={(event) => updateAmount(event.target.value)}
                    disabled={!selectedChannel}
                    placeholder={isUsdtCnyRecharge ? "请输入希望充值的人民币金额" : selectedChannel ? `请输入金额，最低 ${selectedChannel.minimumAmount} ${selectedChannel.currency}` : "请先选择支付渠道"}
                    className={cn("h-11", !isUsdtCnyRecharge && selectedChannel?.currency === "USDT" ? "pl-20" : "pl-16", isUsdtCnyRecharge && "pr-16")}
                  />
                  {isUsdtCnyRecharge ? (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">CNY</span>
                  ) : null}
                </div>
                {(isUsdtCnyRecharge ? requestedCnyAmount !== null : legacyChannelAmount > 0) && !reachesMin ? (
                  <p className="mt-2 text-xs text-red-500">
                    当前方式最低充值金额为 {selectedChannel ? formatPaymentAmount(selectedChannel.minimumAmount, selectedChannel.currency) : "—"}。
                  </p>
                ) : null}
                {channelOverLimit ? (
                  <button
                    type="button"
                    className="mt-2 text-left text-xs text-red-600 underline-offset-2 hover:underline"
                    onClick={() => setAmountLimitDialogOpen(true)}
                  >
                    当前方式单笔最高支持 {isUsdtCnyRecharge ? "¥2000 充值本金" : selectedChannel && typeof maximumAmount === "number" ? formatPaymentAmount(Math.min(maximumAmount, 2000), selectedChannel.currency) : "—"}，点击联系客服处理。
                  </button>
                ) : null}

                {isUsdtCnyRecharge ? (
                  <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm">
                    {dailyRate ? (
                      <>
                        <p className="font-semibold text-sky-900">今日结算汇率</p>
                        <p className="mt-1 text-sky-800">1 USDT = {dailyRate.settlementRate} CNY</p>
                        <p className="mt-1 text-xs text-sky-700">汇率日期：{dailyRate.effectiveDate}。创建充值单后汇率即锁定。</p>
                      </>
                    ) : rateLoading ? <p role="status" className="text-sky-700">正在读取今日充值汇率…</p> : <p className="text-red-600">{rateError ?? "今日充值汇率尚未设置"}</p>}
                  </div>
                ) : null}

                {selectedChannel?.providerExternalFeeDisclosure ? <p className="mt-3 text-xs leading-5 text-slate-500">{selectedChannel.providerExternalFeeDisclosure} 手续费由买家承担，不扣减到账本金。</p> : null}

                {submitMessage ? (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    {submitMessage}
                  </div>
                ) : null}

                <label className="mt-3 block text-sm font-medium">充值备注（可选）</label>
                <div className="relative mt-1.5"><Input value={customerNote} maxLength={500} onChange={(event) => { setCustomerNote(event.target.value); clientRequestIdRef.current = null; }} placeholder="填写必要的付款说明，最多 500 字" className="h-11 pr-16" /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{customerNote.length}/500</span></div>

                <div data-testid="recharge-summary" className="mt-4 flex flex-col gap-5 rounded-2xl bg-gradient-to-r from-orange-50/80 to-orange-50/40 p-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="grid min-w-0 flex-1 grid-cols-3 divide-x divide-orange-200/60 text-xs text-slate-500">
                    <SummaryItem icon={FileText} label={externalBuyerFee && summary?.fee === 0 ? "平台手续费（约3%）" : "手续费"} value={feeDisplay} />
                    <SummaryItem icon={Clock3} label="预计应付" value={payableDisplay} />
                    <SummaryItem icon={WalletCards} label="预计到账金额" value={arrivalDisplay} />
                  </div>
                  <Button
                    className="h-12 w-full shrink-0 rounded-xl bg-gradient-to-r from-orange-400 to-orange-600 px-6 text-sm shadow-md shadow-orange-200/60 xl:w-auto"
                    disabled={!canSubmit}
                    onClick={createRecharge}
                  >
                    {isSubmitting ? "提交中..." : <>创建充值单 <ArrowUpRight className="ml-2 h-4 w-4" /></>}
                  </Button>
                </div>
                {isUsdtCnyRecharge ? <p className="mt-3 text-xs leading-5 text-slate-500">创建充值单后生成 4 位小数的精确应付 USDT；匹配成功后按申请的人民币金额原额到账。</p> : null}
              </div>
            </CardContent>
            </Card>
          </div>

          <Card data-testid="recharge-history-panel" className="flex min-w-0 flex-col rounded-[20px] border-[#eaded2] bg-[#fffdfb] shadow-[0_6px_24px_-20px_rgba(91,62,38,0.35)] md:min-h-0 md:overflow-hidden">
          <CardContent className="flex min-w-0 flex-1 flex-col p-3.5 md:min-h-0 md:overflow-hidden">
            <RechargeRecordTabs value={historyTab} onChange={setHistoryTab} />
            <div id="recharge-history-content" role="tabpanel" aria-labelledby="recharge-history-tab" hidden={historyTab !== "recharges"} className={cn("min-w-0 flex-1 flex-col md:min-h-0", historyTab === "recharges" ? "flex" : "hidden")}>
            <RechargeRecords
              records={recordViewKey === `${recordIdentity.epoch}:${recordPage}` ? records : []}
              loading={recordIdentity.status === "checking" || (recordIdentity.status === "signed-in" && (recordsLoading || recordViewKey !== `${recordIdentity.epoch}:${recordPage}`))}
              loadingCount={accountRecordPreload.countHint("recharges", recordPage)}
              error={recordIdentity.status === "anonymous" ? { message: "请先登录后查看充值记录。", code: "RECHARGE_AUTH_REQUIRED", requestId: "" } : recordViewKey === `${recordIdentity.epoch}:${recordPage}` ? recordsError : null}
              page={recordPage}
              count={recordViewKey === `${recordIdentity.epoch}:${recordPage}` ? recordCount : 0}
              nowTick={historyNowTick}
              onRetry={() => void loadRecords(recordPage, true)}
              onPageChange={setRecordPage}
              onProofSubmitted={() => void loadRecords(recordPage, true)}
            />
            </div>
            <div id="balance-history-content" role="tabpanel" aria-labelledby="balance-history-tab" hidden={historyTab !== "balance"} className={cn("min-w-0 flex-1 flex-col md:min-h-0", historyTab === "balance" ? "flex" : "hidden")}><BalanceTransactionRecords /></div>
          </CardContent>
          </Card>
        </div>
      </div>
      <Dialog open={amountLimitDialogOpen} onOpenChange={setAmountLimitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>单笔支付金额超限</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-6 text-muted-foreground">
            支付金额大于2000联系人工客服处理。
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setAmountLimitDialogOpen(false)}>取消</Button>
            <Button variant="outline" onClick={() => { setAmountLimitDialogOpen(false); openPublicSupport(); }}>联系客服</Button>
            <Button onClick={() => { if (typeof maximumAmount === "number") setAmountText(String(isUsdtCnyRecharge ? 2000 : Math.min(maximumAmount, 2000))); clientRequestIdRef.current = null; setAmountLimitDialogOpen(false); }}>改为上限金额</Button>
          </div>
        </DialogContent>
      </Dialog>
    </PublicLayout>
  );
}

function Notice({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return <div data-testid="recharge-notice-item" className={cn(channelGridStyles.noticeItem, "min-w-0 p-3")}><div className="mb-2 flex items-center gap-2.5"><span className={cn(channelGridStyles.noticeIcon, "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-orange-500")}><Icon className="h-[18px] w-[18px]" /></span><h3 className="font-semibold text-slate-800">{title}</h3></div><div>{children}</div></div>;
}

function SummaryItem({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return <div className="flex min-w-0 flex-col gap-2 px-2 first:pl-0 sm:flex-row sm:items-center sm:gap-3"><Icon className="hidden h-6 w-6 shrink-0 text-orange-500 lg:block" /><div className="min-w-0"><div className="text-[11px] leading-4">{label}</div><div data-summary-value className="mt-1 break-words text-sm font-semibold text-slate-900 sm:text-base">{value}</div></div></div>;
}

function createClientRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function RecordLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <dt className="shrink-0 text-slate-500">{label}：</dt>
      <dd className="min-w-0 break-all text-right text-slate-600">{value}</dd>
    </div>
  );
}

function RechargeRecords({ records, loading, loadingCount, error, page, count, nowTick, onRetry, onPageChange, onProofSubmitted }: { records: RechargeRecord[]; loading: boolean; loadingCount?: number; error: RechargeListError | null; page: number; count: number; nowTick: number; onRetry: () => void; onPageChange: (page: number) => void; onProofSubmitted: () => void }) {
  const totalPages = Math.max(1, Math.ceil(count / 10));
  if (error?.code === "RECHARGE_AUTH_REQUIRED") return <RecordLoginState />;
  if (error) return (
    <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
      <p>{error.code === "RECHARGE_AUTH_REQUIRED" ? "请先登录后查看充值记录。" : error.message}</p>
      <p className="mt-2 text-xs">诊断码：{error.code}</p>
      <p className="mt-1 text-xs">诊断编号：{error.requestId}</p>
      <Button variant="outline" size="sm" className="mt-3" disabled={loading} onClick={onRetry}>
        {loading ? "正在重新加载…" : "重新加载"}
      </Button>
    </div>
  );
  if (loading) return <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-y-auto"><RecordLoadingPlaceholder count={loadingCount} label="充值记录加载中" /></div>;
  if (records.length === 0) return (
    <RechargeEmptyState title="暂无充值记录" />
  );
  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 md:min-h-0 md:flex-1 md:overflow-y-auto">
        {records.map((record) => {
          const now = new Date(Date.now() + nowTick * 0);
          const expired = record.status === "expired" || isRechargePastDue(record.expiresAt, now);
          const isExternalCny = record.channelCode === "alipay" || record.channelCode === "wechat";
          const canContinue = isExternalCny
            ? canContinueLiuhaoyiRechargePayment(record as unknown as Record<string, unknown>, now)
            : Boolean(record.expectedUsdtAmount && ["pending", "waiting_payment"].includes(String(record.status)) && !expired);
          const status = expired ? "expired" : record.status;
          const remainingSeconds = secondsUntil(record.expiresAt, now);
          return <div key={record.rechargeNo} className="min-w-0 rounded-2xl border border-[#eee4d9] bg-white p-4 text-sm shadow-[0_2px_10px_-8px_rgba(91,62,38,0.25)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="min-w-0 break-all font-semibold text-slate-800" title={record.rechargeNo}>{record.rechargeNo}</span>
              <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">{rechargeStatusLabel(status)}</span>
            </div>
            <dl className="grid gap-2 text-muted-foreground">
              <RecordLine label="支付渠道" value={record.channelName} />
              {record.network ? <RecordLine label="网络" value={record.network} /> : null}
              <RecordLine label="充值金额" value={record.requestedCnyAmount ? `¥${record.requestedCnyAmount}` : formatPaymentAmount(record.requestedAmount, record.currency)} />
              {record.lockedSettlementRate ? <RecordLine label="锁定汇率" value={`1 USDT = ¥${record.lockedSettlementRate}`} /> : null}
              {record.expectedUsdtAmount ? <RecordLine label="精确应付" value={`${record.expectedUsdtAmount} USDT`} /> : null}
              <CopyableRecordLine label="订单编号" value={record.rechargeNo} />
              {record.expiresAt ? <RecordLine label="支付有效期至" value={formatDateTime(record.expiresAt)} /> : null}
              {canContinue ? <RecordLine label="待支付剩余时间" value={formatCountdown(remainingSeconds)} /> : null}
              {record.paymentAddress ? <RecordLine label="收款地址" value={record.paymentAddress} /> : null}
              {record.paymentTokenContract ? <RecordLine label="Token 合约" value={record.paymentTokenContract} /> : null}
              {record.actualReceivedUsdt ? <RecordLine label="实际到账" value={`${record.actualReceivedUsdt} USDT`} /> : null}
              <RecordLine label="本站手续费" value={record.feeAmount === 0 ? "0" : formatPaymentAmount(record.feeAmount, record.currency)} />
              {record.providerExternalFeeDisclosure ? <RecordLine label="支付通道手续费" value={record.providerExternalFeeDisclosure} /> : null}
              {!record.expectedUsdtAmount ? <RecordLine label="应付金额" value={formatPaymentAmount(record.payableAmount, record.currency)} /> : null}
              <RecordLine label="到账金额" value={record.creditedCnyAmount ? `¥${record.creditedCnyAmount}` : formatPaymentAmount(record.creditedAmount, record.currency)} />
              <RecordLine label="创建时间" value={formatDateTime(record.createdAt)} />
              {record.completedAt ? <RecordLine label="到账时间" value={formatDateTime(record.completedAt)} /> : null}
              {record.reviewReason && ["failed", "rejected", "cancelled"].includes(String(record.status)) ? <RecordLine label="处理说明" value={record.reviewReason} /> : null}
            </dl>
            {canContinue ? <Button asChild size="sm" className="mt-3"><Link href={`/payment?recharge=${encodeURIComponent(record.rechargeNo)}`}>继续支付</Link></Button> : null}
            {expired ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              <p>充值订单已过期。如您已完成转账，请联系人工客服并提供充值订单编号。</p>
              <Button type="button" size="sm" variant="outline" className="mt-2" onClick={openPublicSupport}>联系客服</Button>
            </div> : null}
            {!expired && ["waiting_payment", "submitted", "rejected"].includes(String(record.status)) ? (record.expectedUsdtAmount ? <RechargeBep20VerifyForm record={record} onSubmitted={onProofSubmitted} /> : <RechargeProofForm record={record} onSubmitted={onProofSubmitted} />) : null}
          </div>;
        })}
      </div>
      {count > 10 ? (
        <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>共 {count} 条</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>上一页</Button>
            <span>{page} / {totalPages}</span>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>下一页</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RechargeBep20VerifyForm({ record, onSubmitted }: { record: RechargeRecord; onSubmitted: () => void }) {
  const [txHash, setTxHash] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function verify() {
    if (submitting || !/^0x[0-9a-fA-F]{64}$/.test(txHash.trim())) {
      setError("请输入合法的 0x 开头 32 字节交易哈希。");
      return;
    }
    setSubmitting(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/recharges/${encodeURIComponent(record.rechargeNo)}/bep20/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: txHash.trim() }),
      });
      const payload = await response.json().catch(() => null) as { error?: string; actualReceivedUsdt?: string; creditedCnyAmount?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "链上交易核验失败");
      setMessage(`已核验实际到账 ${payload?.actualReceivedUsdt ?? "—"} USDT，预计入账 ¥${payload?.creditedCnyAmount ?? "—"}。等待管理员审核。`);
      onSubmitted();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "链上交易核验失败");
    } finally { setSubmitting(false); }
  }
  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      <p className="text-xs font-medium text-amber-700">请精确支付 {record.expectedUsdtAmount} USDT，此 4 位小数金额用于识别你的充值单，请勿自行修改。金额不一致或超时付款将转人工处理。</p>
      <Input value={txHash} onChange={(event) => setTxHash(event.target.value)} placeholder="输入 BEP20 TxHash" maxLength={66} />
      {message ? <p className="text-xs text-emerald-600">{message}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <Button size="sm" disabled={submitting} onClick={() => void verify()}>{submitting ? "核验中..." : "提交 TxHash 并核验"}</Button>
    </div>
  );
}

function RechargeProofForm({ record, onSubmitted }: { record: RechargeRecord; onSubmitted: () => void }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [reference, setReference] = useState("");
  const [payer, setPayer] = useState("");
  const [paymentTime, setPaymentTime] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const form = new FormData();
      form.set("paymentAmount", String(record.payableAmount));
      form.set("transactionReference", reference);
      form.set("payerAccountSummary", payer);
      form.set("paymentTime", paymentTime);
      form.set("userNote", note);
      files.forEach((file) => form.append("files", file));
      const response = await fetch(`/api/recharges/${encodeURIComponent(record.rechargeNo)}/proof`, { method: "POST", body: form });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "凭证提交失败，请稍后重试。");
      setOpen(false); setFiles([]); setReference(""); setPayer(""); setPaymentTime(""); setNote(""); onSubmitted();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "凭证提交失败，请稍后重试。"); }
    finally { setSubmitting(false); }
  }
  return <div className="mt-3 border-t pt-3">{!open ? <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{record.status === "submitted" ? "补充支付凭证" : "提交支付凭证"}</Button> : <div className="space-y-2 rounded-lg border bg-white p-3"><div className="text-xs text-slate-500">付款金额：{formatPaymentAmount(record.payableAmount, record.currency)}</div><Input value={reference} maxLength={160} onChange={(e) => setReference(e.target.value)} placeholder="交易流水号" /><Input value={payer} maxLength={120} onChange={(e) => setPayer(e.target.value)} placeholder="付款账号摘要（请勿填写完整敏感信息）" /><Input type="datetime-local" value={paymentTime} onChange={(e) => setPaymentTime(e.target.value)} /><Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="用户备注（可选）" /><Input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 3))} /><p className="text-xs text-slate-500">支持 JPG、PNG、WEBP、PDF，单个最大 5MB，最多 3 个。</p><div className="flex gap-2"><Button size="sm" disabled={submitting} onClick={() => void submit()}>{submitting ? "提交中..." : "提交审核"}</Button><Button size="sm" variant="outline" disabled={submitting} onClick={() => setOpen(false)}>取消</Button></div></div>}</div>;
}

function CopyableRecordLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <dt className="shrink-0 text-slate-500">{label}：</dt>
      <dd className="flex min-w-0 flex-wrap items-center justify-end gap-1 text-right text-slate-600">
        <span className="min-w-0 break-all" title={value}>{value}</span>
        <Button type="button" size="sm" variant="ghost" className="h-8 shrink-0 px-2" onClick={() => void copyRechargeNo(value)}>复制</Button>
      </dd>
    </div>
  );
}

async function copyRechargeNo(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success("充值订单编号已复制");
  } catch {
    toast.error("复制失败，请手动复制订单编号");
  }
}

function secondsUntil(expiresAt: string | null, now: Date) {
  if (!expiresAt) return 0;
  return Math.max(0, Math.floor((Date.parse(expiresAt) - now.getTime()) / 1000));
}

function formatCountdown(totalSeconds: number) {
  return `${Math.floor(totalSeconds / 60)} 分 ${totalSeconds % 60} 秒`;
}

function normalizeAmountInput(value: string, currency: PaymentCurrency) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [integerPart, ...decimalParts] = cleaned.split(".");
  const decimalLimit = currency === "USDT" ? 6 : 2;
  const decimal = decimalParts.join("").slice(0, decimalLimit);
  if (cleaned.includes(".")) return `${integerPart || "0"}.${decimal}`;
  return integerPart.replace(/^0+(?=\d)/, "");
}

function getClientErrorMessage(error: unknown, fallback = "充值下单失败，请稍后重试") {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage) return maybeMessage;
  }
  return fallback;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false });
}
