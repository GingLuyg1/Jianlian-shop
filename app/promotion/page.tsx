"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRightLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  CreditCard,
  Gift,
  Headphones,
  Link2,
  Loader2,
  MessageSquareQuote,
  Percent,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import PublicLayout from "@/components/layout/PublicLayout";
import { publicMainPanelHeightClassName } from "@/components/layout/public-content";
import PromotionPosterCarousel from "@/components/promotion/PromotionPosterCarousel";
import { openPublicSupport } from "@/lib/support/open-public-support";
import { setRouteDocumentTitle } from "@/lib/navigation/document-title";
import { useAccountRecordIdentity } from "@/hooks/use-account-record-identity";
import { useMobileStorefront } from "@/hooks/use-mobile-storefront";
import { PROMOTION_MIN_TRANSFER_AMOUNT } from "@/lib/promotion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import glass from "@/components/account/AccountGlass.module.css";

const PAGE_SIZE = 10;

type ReferralStatus = "pending" | "available" | "withdrawn" | "cancelled";

type NullableStat = {
  value: number | null;
  error?: string;
};

type ReferralRecord = {
  id: string;
  referredUser: string;
  orderNo: string;
  paidAt: string | null;
  orderAmount: number;
  commissionRate: number;
  commissionAmount: number;
  status: ReferralStatus;
};

type TransferRecord = {
  id: string;
  transactionNo: string;
  amount: number;
  balanceAfter: number | null;
  status: string;
  remark: string;
  createdAt: string | null;
};

type ReferralResponse = {
  inviteCode: string;
  userEmail?: string;
  promotionEnabled?: boolean;
  commissionRate: number;
  minWithdrawAmount: number;
  updatedAt: string;
  stats: {
    visits: NullableStat;
    registrations: NullableStat;
    referrals: NullableStat;
    registrationRate: { value: string | null; error?: string };
    totalCommission: number | null;
    availableCommission: number | null;
    pendingCommission?: number | null;
    withdrawnCommission?: number | null;
    qualifiedOrderCount?: number;
    qualifiedOrderAmount?: number;
    commissionError?: string;
  };
  records: ReferralRecord[];
  transfers?: TransferRecord[];
  recordError?: string;
  count: number;
  page: number;
  pageSize: number;
  error?: string;
};

const statusLabels: Record<ReferralStatus, string> = {
  pending: "待结算",
  available: "可转余额",
  withdrawn: "已转余额",
  cancelled: "已取消",
};

const statusStyles: Record<ReferralStatus, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200/80",
  available: "bg-emerald-50 text-emerald-700 ring-emerald-200/80",
  withdrawn: "bg-blue-50 text-blue-700 ring-blue-200/80",
  cancelled: "bg-slate-100 text-slate-500 ring-slate-200",
};

function formatMoney(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return `¥${amount.toFixed(2)}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getPromotionOrigin() {
  return "https://www.jianlian.shop";
}

function getErrorMessage(error: unknown, fallback = "推广数据读取失败，请稍后重试") {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn(glass.inset, "flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5")}>
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm font-bold text-slate-900">{value}</span>
    </div>
  );
}

function MetricTile({
  label,
  value,
  icon: Icon,
  highlight = false,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  highlight?: boolean;
}) {
  return (
    <div className={cn(glass.inset, "flex flex-col justify-between rounded-xl px-3 py-2.5 transition-colors hover:bg-white/95")}>
      <div className="flex items-center justify-between gap-1.5">
        <span className="truncate text-[11px] font-medium text-slate-500">{label}</span>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-orange-100/75 text-primary">
          <Icon className="h-3 w-3" />
        </span>
      </div>
      <div
        className={cn(
          "mt-1.5 truncate text-base font-bold tabular-nums text-slate-950 sm:text-lg",
          highlight && "text-primary"
        )}
      >
        {value}
      </div>
    </div>
  );
}

export default function PromotionPage() {
  const { isMobile } = useMobileStorefront();
  const identity = useAccountRecordIdentity();
  const [storedData, setData] = useState<ReferralResponse | null>(null);
  const [loadedEpoch, setLoadedEpoch] = useState(identity.epoch);
  const [page, setPage] = useState(1);
  const [requestLoading, setLoading] = useState(true);
  const data = loadedEpoch === identity.epoch ? storedData : null;
  const loading = requestLoading || loadedEpoch !== identity.epoch;
  const activeRequest = useRef<{ page: number; epoch: number; controller: AbortController; promise?: Promise<void> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<"" | "link" | "code" | "pitch">("");

  // Transfer-to-balance modal state
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);

  // Records tabs & filters
  const [recordTab, setRecordTab] = useState<"commissions" | "transfers">("commissions");
  const [statusFilter, setStatusFilter] = useState<"all" | ReferralStatus>("all");
  const [searchKeyword, setSearchKeyword] = useState("");

  useEffect(() => {
    setRouteDocumentTitle("推广中心 | Jianlian Shop");
  }, []);

  const loadPromotionData = useCallback(
    async (targetPage = page, force = false) => {
      const requestEpoch = identity.epoch;
      if (identity.status === "anonymous") {
        activeRequest.current?.controller.abort();
        activeRequest.current = null;
        setData(null);
        setLoadedEpoch(requestEpoch);
        setError("请先登录账户后查看您的专属推广链接、海报与返佣记录");
        setLoading(false);
        return;
      }
      if (identity.status === "checking") {
        setLoading(true);
        return;
      }

      if (!force && activeRequest.current?.page === targetPage && activeRequest.current.epoch === requestEpoch && activeRequest.current.promise) {
        return activeRequest.current.promise;
      }

      activeRequest.current?.controller.abort();
      const controller = new AbortController();
      const entry: { page: number; epoch: number; controller: AbortController; promise?: Promise<void> } = {
        page: targetPage,
        epoch: requestEpoch,
        controller,
      };
      activeRequest.current = entry;
      setLoading(true);
      setError(null);

      const promise = (async () => {
        try {
          const params = new URLSearchParams({
            page: String(targetPage),
            pageSize: String(PAGE_SIZE),
          });
          const res = await fetch(`/api/referrals?${params.toString()}`, {
            cache: "no-store",
            signal: controller.signal,
          });
          const payload = (await res.json().catch(() => null)) as ReferralResponse | null;
          if (controller.signal.aborted || activeRequest.current !== entry) return;
          if (res.status === 401) {
            setData(null);
            setLoadedEpoch(requestEpoch);
            setError("请先登录账户后查看推广中心数据");
            return;
          }
          if (!res.ok || !payload) {
            setError(payload?.error || "推广数据读取失败，请稍后重试");
            return;
          }
          setData(payload);
          setLoadedEpoch(requestEpoch);
          setError(null);
        } catch (err) {
          if (controller.signal.aborted || activeRequest.current !== entry) return;
          setError(getErrorMessage(err));
        } finally {
          if (activeRequest.current === entry) {
            setLoading(false);
          }
        }
      })();

      entry.promise = promise;
      return promise;
    },
    [identity.epoch, identity.status, identity.userId, page]
  );

  useEffect(() => {
    void loadPromotionData(page);
  }, [loadPromotionData, page]);

  const inviteCode = data?.inviteCode?.trim() || "";
  const inviteUrl = inviteCode ? `${getPromotionOrigin()}/register?invite=${encodeURIComponent(inviteCode)}` : "";
  const sharePitch = inviteUrl
    ? `推荐「简联商城」跨境数字资源一站式平台，涵盖 AI 订阅、数字 / 社媒账号与国际 SIM 卡，通过我的专属链接注册：${inviteUrl}`
    : "";
  const totalCommission = Number(data?.stats?.totalCommission ?? 0);
  const availableCommission = Number(data?.stats?.availableCommission ?? 0);
  const pendingCommission = Number(data?.stats?.pendingCommission ?? 0);
  const withdrawnCommission = Number(data?.stats?.withdrawnCommission ?? 0);
  const minTransferAmount = Number(data?.minWithdrawAmount ?? PROMOTION_MIN_TRANSFER_AMOUNT) || PROMOTION_MIN_TRANSFER_AMOUNT;
  const progressPct = Math.min(100, Math.round((availableCommission / Math.max(0.01, minTransferAmount)) * 100));
  const shortfallAmount = Math.max(0, minTransferAmount - availableCommission);
  const canTransfer = availableCommission >= minTransferAmount && availableCommission > 0;
  const totalPages = Math.max(1, Math.ceil(Number(data?.count ?? 0) / PAGE_SIZE));

  const copyText = async (value: string, key: "link" | "code" | "pitch", label: string) => {
    if (!value) {
      toast.error("请先登录后获取专属邀请信息");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      toast.success(`${label}已复制`);
      window.setTimeout(() => setCopiedKey((curr) => (curr === key ? "" : curr)), 2000);
    } catch {
      toast.error("复制失败，请手动选中复制");
    }
  };

  const handleTransferToBalance = async () => {
    if (transferring || !canTransfer) return;
    setTransferring(true);
    try {
      const res = await fetch("/api/referrals/transfer-to-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: `promo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        }),
      });
      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        result?: { transferred_amount?: number; balance_after?: number };
      } | null;

      if (!res.ok || !payload?.ok) {
        toast.error(payload?.error || "转入余额失败，请稍后重试");
        return;
      }

      const transferred = Number(payload.result?.transferred_amount ?? availableCommission);
      toast.success(`已成功转入 ¥${transferred.toFixed(2)} 至您的本站账户余额`);
      setTransferModalOpen(false);
      await loadPromotionData(1, true);
    } catch {
      toast.error("网络异常，转入余额失败，请稍后重试");
    } finally {
      setTransferring(false);
    }
  };

  const filteredRecords = useMemo(() => {
    const list = data?.records ?? [];
    const q = searchKeyword.trim().toLowerCase();
    return list.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!q) return true;
      return (
        row.referredUser.toLowerCase().includes(q) ||
        row.orderNo.toLowerCase().includes(q) ||
        statusLabels[row.status].includes(q)
      );
    });
  }, [data?.records, searchKeyword, statusFilter]);

  const filteredTransfers = useMemo(() => {
    const list = data?.transfers ?? [];
    const q = searchKeyword.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (row) =>
        row.transactionNo.toLowerCase().includes(q) ||
        row.remark.toLowerCase().includes(q)
    );
  }, [data?.transfers, searchKeyword]);

  return (
    <PublicLayout
      mobileNavigationUntilLg
      contentClassName={cn("mx-auto w-full max-w-[1540px] px-4 py-3 md:px-6", isMobile && "!px-3 !py-2.5")}
    >
      <div
        data-testid="promotion-center-page"
        className={cn(
          "flex flex-col gap-4 overflow-y-auto pb-8 pr-0.5 sidebar-scroll",
          publicMainPanelHeightClassName,
          isMobile && "!h-auto !overflow-visible"
        )}
      >
        {/* 1. 顶部横幅与统一佣金钱包条 */}
        <section className={cn(glass.surface, "flex flex-col gap-4 rounded-2xl p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between")}>
          <div className="min-w-0">
            <div className="flex items-start gap-3 sm:items-center">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-sm">
                <Gift className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-bold text-slate-950 sm:text-xl">推广中心</h1>
                  <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                    3% 订单返佣
                  </span>
                  <span className="hidden rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 sm:inline-flex">
                    海报原生含码 · 支持右键复制
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">
                  分享专属链接或高清二维码海报邀请好友注册，好友购买「数字 / 社媒账号」或「国际 SIM 卡（不含 SIM 卡服务）」即享 3% 返佣，支持一键转入本站账户余额。
                </p>
              </div>
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-2.5 sm:flex sm:items-stretch">
            <div className={cn(glass.inset, "flex min-w-[122px] flex-col justify-center rounded-xl px-3.5 py-2.5")}>
              <span className="text-[11px] font-medium text-slate-500">累计佣金</span>
              <span className="mt-1 text-lg font-bold tabular-nums text-slate-950">
                {loading ? "--" : formatMoney(totalCommission)}
              </span>
            </div>

            <div className={cn(glass.inset, "hidden min-w-[116px] flex-col justify-center rounded-xl px-3.5 py-2.5 md:flex")}>
              <span className="text-[11px] font-medium text-slate-500">待结算</span>
              <span className="mt-1 text-lg font-bold tabular-nums text-slate-800">
                {loading ? "--" : formatMoney(pendingCommission)}
              </span>
            </div>

            <div className={cn(glass.inset, "col-span-2 flex min-w-[216px] items-center justify-between gap-3 rounded-xl border-orange-200/80 px-3.5 py-2.5 sm:col-span-1")}>
              <div className="min-w-0">
                <span className="block text-[11px] font-medium text-slate-500">可转余额</span>
                <span className="mt-1 block text-lg font-bold tabular-nums text-primary">
                  {loading ? "--" : formatMoney(availableCommission)}
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => setTransferModalOpen(true)}
                disabled={identity.status !== "signed-in"}
                className="h-9 shrink-0 rounded-xl px-3.5 text-xs font-semibold shadow-sm"
              >
                <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
                转入余额
              </Button>
            </div>
          </div>
        </section>

        {/* 未登录提示 / 错误提示 */}
        {identity.status === "anonymous" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-200/80 bg-orange-50/85 px-4 py-3 text-sm text-slate-700 shadow-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-primary" />
              <span>当前展示为示例预览海报，登录后将自动把您的专属邀请码嵌入 4 套高清海报并同步实时返佣明细。</span>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild size="sm" variant="outline" className="h-8 rounded-lg bg-white text-xs">
                <Link href="/register?redirect=/promotion">立即注册</Link>
              </Button>
              <Button asChild size="sm" className="h-8 rounded-lg text-xs">
                <Link href="/login?redirect=/promotion">立即登录</Link>
              </Button>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            <span>{error}</span>
            <Button size="sm" variant="outline" className="h-7 bg-white text-xs" onClick={() => void loadPromotionData(page, true)}>
              重试
            </Button>
          </div>
        ) : null}

        {/* 2. 主工作区：左侧独立大尺寸「专属二维码海报工作台」 | 右侧「链接文案 + 数据 + 佣金结算 + 规则」 */}
        <section className="grid items-stretch gap-4 xl:grid-cols-[520px_minmax(0,1fr)] 2xl:grid-cols-[560px_minmax(0,1fr)]">
          {/* 左侧旗舰海报工作台 */}
          <div className={cn(glass.surface, "flex flex-col rounded-2xl p-4 sm:p-5")}>
            <PromotionPosterCarousel
              inviteUrl={inviteUrl}
              inviteCode={inviteCode}
              isPersonalized={identity.status === "signed-in" && Boolean(inviteCode)}
            />
          </div>

          {/* 右侧运营操作区 */}
          <div className="flex min-w-0 flex-col gap-4">
            {/* A. 专属推广链接、话术与核心数据 */}
            <div className={cn(glass.surface, "rounded-2xl p-4 sm:p-5")}>
              <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2 border-b border-orange-100/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-100/75 text-primary">
                    <Link2 className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-slate-950">专属推广入口</h2>
                    <p className="text-[11px] text-slate-500">每个账户固定唯一邀请码，链接与左侧 4 套海报实时同步</p>
                  </div>
                </div>
                {inviteCode ? (
                  <button
                    type="button"
                    onClick={() => void copyText(inviteCode, "code", "专属邀请码")}
                    className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50/90 px-3 py-1 text-xs font-semibold text-primary transition hover:bg-orange-100"
                  >
                    <span>邀请码：{inviteCode}</span>
                    {copiedKey === "code" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                ) : null}
              </div>

              {/* 专属邀请链接 */}
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>专属邀请链接</span>
                  <span className="font-normal text-slate-400">永久绑定推荐关系</span>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-orange-200/80 bg-white/95 p-1.5 pl-3 shadow-2xs">
                  <div className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700" title={inviteUrl || "登录后生成专属推广链接"}>
                    {inviteUrl || "登录后自动生成您的专属推广链接"}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void copyText(inviteUrl, "link", "专属邀请链接")}
                    disabled={!inviteUrl}
                    className="h-8 shrink-0 rounded-lg px-3.5 text-xs font-semibold"
                  >
                    {copiedKey === "link" ? (
                      <>
                        <Check className="mr-1 h-3.5 w-3.5" />
                        已复制
                      </>
                    ) : (
                      <>
                        <Copy className="mr-1 h-3.5 w-3.5" />
                        复制链接
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* 一键推广话术 */}
              <div className="mt-3 rounded-xl border border-orange-100/90 bg-orange-50/45 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <MessageSquareQuote className="h-3.5 w-3.5 text-primary" />
                    <span>快捷推广话术（搭配海报发送转化更高）</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyText(sharePitch, "pitch", "推广话术与链接")}
                    disabled={!sharePitch}
                    className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-primary shadow-2xs transition hover:bg-orange-50 disabled:opacity-50"
                  >
                    {copiedKey === "pitch" ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-600" />
                        <span>已复制话术</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>复制话术</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-600">
                  {sharePitch || "登录后将自动生成包含您专属注册链接的推广话术，一键复制即可搭配左侧二维码海报转发至微信群、朋友圈或社群。"}
                </p>
              </div>

              {/* 核心推广数据 4 联卡（无重复堆叠） */}
              <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <MetricTile
                  label="邀请注册"
                  value={loading ? "--" : (data?.stats?.registrations?.value ?? 0)}
                  icon={Users}
                />
                <MetricTile
                  label="有效返佣订单"
                  value={loading ? "--" : (data?.stats?.qualifiedOrderCount ?? 0)}
                  icon={ShoppingBag}
                />
                <MetricTile
                  label="有效成交额"
                  value={loading ? "--" : formatMoney(data?.stats?.qualifiedOrderAmount ?? 0)}
                  icon={CreditCard}
                />
                <MetricTile
                  label="固定返佣率"
                  value="3.00%"
                  icon={Percent}
                  highlight
                />
              </div>

              <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-orange-100/80 pt-3">
                <span className="text-xs text-slate-500">大流量渠道或需定制品牌推广素材？</span>
                <button
                  type="button"
                  onClick={() => openPublicSupport()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-orange-50"
                >
                  <Headphones className="h-3.5 w-3.5" />
                  <span>如需推广素材请联系客服</span>
                </button>
              </div>
            </div>

            {/* B. 佣金结算与门槛进度 */}
            <div className={cn(glass.surface, "rounded-2xl p-4 sm:p-5")}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100/75 text-primary">
                    <Wallet className="h-4 w-4" />
                  </span>
                  <h2 className="text-base font-bold text-slate-950">佣金结算</h2>
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200/70">
                  仅转入本站余额
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div className={cn(glass.inset, "rounded-xl px-3 py-2.5")}>
                  <div className="text-[11px] text-slate-500">待结算</div>
                  <div className="mt-1 text-base font-bold tabular-nums text-slate-900">
                    {loading ? "--" : formatMoney(pendingCommission)}
                  </div>
                </div>
                <div className={cn(glass.inset, "rounded-xl px-3 py-2.5")}>
                  <div className="text-[11px] text-slate-500">累计已转入</div>
                  <div className="mt-1 text-base font-bold tabular-nums text-slate-900">
                    {loading ? "--" : formatMoney(withdrawnCommission)}
                  </div>
                </div>
                <div className={cn(glass.inset, "rounded-xl border-orange-200/80 bg-orange-50/55 px-3 py-2.5")}>
                  <div className="text-[11px] font-medium text-primary">可转余额</div>
                  <div className="mt-1 text-base font-bold tabular-nums text-primary">
                    {loading ? "--" : formatMoney(availableCommission)}
                  </div>
                </div>
              </div>

              <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                <InfoTile label="商品返佣比例" value="3%" />
                <InfoTile label="充值提佣倍率" value="暂未开放" />
              </div>

              <div className="mt-3 rounded-xl border border-orange-100/90 bg-white/80 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-600">最低转入余额门槛进度</span>
                  <span className="font-semibold tabular-nums text-primary">
                    {formatMoney(availableCommission)} / {formatMoney(minTransferAmount)} ({progressPct}%)
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-orange-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#ea580c] to-[#fb923c] transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                  <span>
                    {canTransfer
                      ? "已达到最低转入门槛，可随时一键转入本站账户余额"
                      : `还差 ${formatMoney(shortfallAmount)} 即可一键转入本站账户余额（即时到账，无手续费）`}
                  </span>
                  {canTransfer ? (
                    <button
                      type="button"
                      onClick={() => setTransferModalOpen(true)}
                      className="shrink-0 font-semibold text-primary hover:underline"
                    >
                      立即转入 →
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            {/* C. 推广流程与返佣规则 */}
            <div className={cn(glass.surface, "flex-1 rounded-2xl p-4 sm:p-5")}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100/75 text-primary">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  <h2 className="text-base font-bold text-slate-950">推广流程与返佣规则</h2>
                </div>
                <span className="text-[11px] text-slate-400">订单支付后自动核算</span>
              </div>

              {/* 3步轻量流程条 */}
              <div className="mb-3.5 grid gap-2 sm:grid-cols-3">
                {[
                  { step: "01", title: "分享海报或链接", desc: "右键复制或下载含码海报" },
                  { step: "02", title: "好友扫码注册", desc: "自动永久绑定推荐关系" },
                  { step: "03", title: "有效下单返 3%", desc: "满额一键转入本站余额" },
                ].map((item) => (
                  <div
                    key={item.step}
                    className="rounded-xl border border-orange-100/85 bg-orange-50/45 px-3 py-2"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary">
                        {item.step}
                      </span>
                      <span className="text-xs font-semibold text-slate-800">{item.title}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">{item.desc}</p>
                  </div>
                ))}
              </div>

              <ol className="space-y-1.5 text-xs leading-5 text-slate-600">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[10px] font-bold text-primary">1</span>
                  <span>每个注册账户拥有唯一固定专属邀请码，好友通过您的链接或海报二维码注册后永久绑定推广关系。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[10px] font-bold text-primary">2</span>
                  <span>返佣比例固定为 <strong className="text-slate-900">3.00%</strong>，仅针对 <strong className="text-slate-900">「数字 / 社媒账号」</strong> 与 <strong className="text-slate-900">「国际 SIM 卡（除 SIM 卡服务外）」</strong> 分类商品的有效支付订单。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[10px] font-bold text-primary">3</span>
                  <span>AI 会员充值、礼品卡 / 充值卡、账号充值及 SIM 卡服务不计入推广返佣。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[10px] font-bold text-primary">4</span>
                  <span>推广返佣<strong className="text-slate-900">仅支持转入本站账户余额</strong>（满 {formatMoney(minTransferAmount)} 即可一键转入，即时到账，可用于站内任意商品消费），不支持外部提现。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[10px] font-bold text-primary">5</span>
                  <span>若推广订单发生退款、取消或存在自邀小号刷佣行为，系统将自动撤销对应返佣。</span>
                </li>
              </ol>
            </div>
          </div>
        </section>

        {/* 3. 底部全宽记录卡片：返佣记录 / 转入余额记录 */}
        <section className={cn(glass.surface, "rounded-2xl p-4 sm:p-5")}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-orange-100/80 pb-3.5">
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-xl border border-orange-200/70 bg-orange-50/70 p-1">
                <button
                  type="button"
                  onClick={() => setRecordTab("commissions")}
                  className={cn(
                    "rounded-lg px-3.5 py-1.5 text-xs font-semibold transition",
                    recordTab === "commissions"
                      ? "bg-white text-primary shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  返佣记录
                </button>
                <button
                  type="button"
                  onClick={() => setRecordTab("transfers")}
                  className={cn(
                    "rounded-lg px-3.5 py-1.5 text-xs font-semibold transition",
                    recordTab === "transfers"
                      ? "bg-white text-primary shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  转入余额记录
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder={recordTab === "commissions" ? "搜索好友 / 订单号 / 状态" : "搜索流水号 / 备注"}
                  className="h-8 w-52 rounded-lg border border-orange-200/80 bg-white/90 pl-8 pr-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-primary focus:outline-none"
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void loadPromotionData(page, true)}
                disabled={loading}
                className="h-8 rounded-lg border-orange-200/80 bg-white px-2.5 text-xs"
              >
                <RefreshCw className={cn("mr-1 h-3.5 w-3.5", loading && "animate-spin")} />
                刷新记录
              </Button>
            </div>
          </div>

          {recordTab === "commissions" ? (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {(["all", "available", "pending", "withdrawn", "cancelled"] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setStatusFilter(key)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium transition",
                      statusFilter === key
                        ? "bg-primary text-white shadow-xs"
                        : "bg-white/80 text-slate-600 ring-1 ring-inset ring-orange-100 hover:bg-orange-50"
                    )}
                  >
                    {key === "all" ? "全部" : statusLabels[key]}
                  </button>
                ))}
              </div>

              <div className={cn(glass.table, "mt-3 overflow-x-auto rounded-xl")} data-empty={filteredRecords.length === 0 ? "true" : undefined}>
                <table className="w-full min-w-[680px] text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-orange-100/80 text-xs">
                      <th className="py-2.5 pl-4 pr-3 font-semibold">被邀请好友</th>
                      <th className="py-2.5 px-3 font-semibold">订单编号</th>
                      <th className="py-2.5 px-3 text-right font-semibold">有效金额</th>
                      <th className="py-2.5 px-3 text-center font-semibold">佣金率</th>
                      <th className="py-2.5 px-3 text-right font-semibold">返佣金额</th>
                      <th className="py-2.5 px-3 text-center font-semibold">状态</th>
                      <th className="py-2.5 pl-3 pr-4 text-right font-semibold">时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-orange-100/60">
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-xs text-slate-400">
                          正在读取返佣记录...
                        </td>
                      </tr>
                    ) : filteredRecords.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-xs text-slate-400">
                          暂无匹配返佣记录，分享您的专属链接或海报给好友即可开始赚取 3% 返佣
                        </td>
                      </tr>
                    ) : (
                      filteredRecords.map((row) => (
                        <tr key={row.id} className="transition-colors">
                          <td className="py-3 pl-4 pr-3 font-medium text-slate-800">{row.referredUser}</td>
                          <td className="py-3 px-3 font-mono text-xs text-slate-600">{row.orderNo}</td>
                          <td className="py-3 px-3 text-right tabular-nums text-slate-700">{formatMoney(row.orderAmount)}</td>
                          <td className="py-3 px-3 text-center tabular-nums text-slate-600">{(row.commissionRate * 100).toFixed(0)}%</td>
                          <td className="py-3 px-3 text-right font-semibold tabular-nums text-primary">+{formatMoney(row.commissionAmount)}</td>
                          <td className="py-3 px-3 text-center">
                            <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", statusStyles[row.status])}>
                              {statusLabels[row.status]}
                            </span>
                          </td>
                          <td className="py-3 pl-3 pr-4 text-right text-xs tabular-nums text-slate-500">{formatDateTime(row.paidAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-orange-100/80 pt-3 text-xs text-slate-500">
                <span>共 {data?.count ?? 0} 条返佣记录</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-orange-100 bg-white text-slate-600 hover:bg-orange-50 disabled:opacity-40"
                    aria-label="上一页"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="px-2 font-semibold text-slate-700">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-orange-100 bg-white text-slate-600 hover:bg-orange-50 disabled:opacity-40"
                    aria-label="下一页"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className={cn(glass.table, "mt-3 overflow-x-auto rounded-xl")} data-empty={filteredTransfers.length === 0 ? "true" : undefined}>
              <table className="w-full min-w-[640px] text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-orange-100/80 text-xs">
                    <th className="py-2.5 pl-4 pr-3 font-semibold">流水编号</th>
                    <th className="py-2.5 px-3 font-semibold">说明</th>
                    <th className="py-2.5 px-3 text-right font-semibold">转入金额</th>
                    <th className="py-2.5 px-3 text-right font-semibold">转入后余额</th>
                    <th className="py-2.5 px-3 text-center font-semibold">状态</th>
                    <th className="py-2.5 pl-3 pr-4 text-right font-semibold">时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-orange-100/60">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-xs text-slate-400">
                        正在读取转入余额记录...
                      </td>
                    </tr>
                  ) : filteredTransfers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-xs text-slate-400">
                        暂无转入余额记录
                      </td>
                    </tr>
                  ) : (
                    filteredTransfers.map((row) => (
                      <tr key={row.id} className="transition-colors">
                        <td className="py-3 pl-4 pr-3 font-mono text-xs text-slate-600">{row.transactionNo}</td>
                        <td className="py-3 px-3 text-slate-700">{row.remark}</td>
                        <td className="py-3 px-3 text-right font-semibold tabular-nums text-emerald-700">+{formatMoney(row.amount)}</td>
                        <td className="py-3 px-3 text-right tabular-nums text-slate-700">
                          {row.balanceAfter !== null ? formatMoney(row.balanceAfter) : "-"}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200/80">
                            已转入余额
                          </span>
                        </td>
                        <td className="py-3 pl-3 pr-4 text-right text-xs tabular-nums text-slate-500">{formatDateTime(row.createdAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* 转入本站账户余额弹窗 */}
      <Dialog open={transferModalOpen} onOpenChange={setTransferModalOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100 text-primary">
                <ArrowRightLeft className="h-4 w-4" />
              </span>
              <span>佣金转入本站余额</span>
            </DialogTitle>
            <DialogDescription>
              返佣仅支持转入您的简联商城账户余额，即时到账且无手续费。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-1">
            <div className="flex items-center justify-between rounded-xl border border-orange-200/80 bg-orange-50/60 px-4 py-3.5">
              <div>
                <div className="text-xs text-slate-500">当前可转入佣金</div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-primary">
                  {formatMoney(availableCommission)}
                </div>
              </div>
              <Wallet className="h-7 w-7 text-primary/70" />
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-2.5 text-xs">
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-500">到账账户</span>
                <span className="font-semibold text-slate-900">{data?.userEmail || "当前登录账户"}</span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200/70 py-1">
                <span className="text-slate-500">到账方式</span>
                <span className="font-semibold text-emerald-700">本站账户余额（实时到账）</span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200/70 py-1">
                <span className="text-slate-500">最低转入门槛</span>
                <span className="font-semibold tabular-nums text-slate-900">{formatMoney(minTransferAmount)}</span>
              </div>
            </div>

            {!canTransfer ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs leading-5 text-amber-800">
                当前可转佣金尚未达到最低转入门槛，还差 <strong>{formatMoney(shortfallAmount)}</strong>。累计满 {formatMoney(minTransferAmount)} 后即可一键转入本站余额。
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setTransferModalOpen(false)} disabled={transferring}>
                取消
              </Button>
              <Button
                type="button"
                onClick={() => void handleTransferToBalance()}
                disabled={!canTransfer || transferring}
              >
                {transferring ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    正在转入...
                  </>
                ) : canTransfer ? (
                  `确认全部转入 (${formatMoney(availableCommission)})`
                ) : (
                  "未达到最低转入门槛"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PublicLayout>
  );
}
