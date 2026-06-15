"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  DollarSign,
  Link2,
  type LucideIcon,
  Percent,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";

import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getCurrentProfile,
  getSupabaseBrowserClient,
  hasSupabaseConfig,
  type UserProfile,
} from "@/lib/supabase/client";
import {
  createInviteCodeFromUserId,
  formatDateTime,
  formatMoney,
  maskUserLabel,
  PROMOTION_COMMISSION_RATE,
  PROMOTION_MIN_WITHDRAW_AMOUNT,
  PROMOTION_RECORDS_PER_PAGE,
} from "@/lib/promotion";

type PromotionStat = {
  label: string;
  value: string;
  icon: LucideIcon;
  highlight?: boolean;
};

type PromotionRecord = {
  id: string;
  userLabel: string;
  paidAt: string;
  rechargeAmount: number;
  commissionAmount: number;
  status: string;
};

const tableHeaders = ["用户名", "支付时间", "充值金额", "佣金变动", "付款状态"];

export default function PromotionPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [records, setRecords] = useState<PromotionRecord[]>([]);
  const [visitCount, setVisitCount] = useState(0);
  const [registerCount, setRegisterCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [shortLink, setShortLink] = useState("");
  const [notice, setNotice] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const inviteCode = profile?.invite_code || "";
  const promotionLink = inviteCode
    ? `https://www.jianlian.shop/register?invite=${encodeURIComponent(
        inviteCode
      )}`
    : "";
  const shortLinkBase = inviteCode
    ? `https://jianlian.shop/r/${encodeURIComponent(inviteCode)}`
    : "";

  const totalIncome = records.reduce(
    (sum, record) => sum + record.commissionAmount,
    0
  );
  const availableIncome = profile?.promotion_balance ?? totalIncome;
  const registerRate = visitCount > 0 ? (registerCount / visitCount) * 100 : 0;

  const promotionStats: PromotionStat[] = [
    { label: "访问量", value: String(visitCount), icon: BarChart3 },
    { label: "注册", value: String(registerCount), icon: Users },
    { label: "推荐人", value: String(registerCount), icon: Users },
    { label: "注册率", value: `${registerRate.toFixed(2)}%`, icon: Percent },
    { label: "总收入", value: formatMoney(totalIncome), icon: DollarSign },
    {
      label: "可用金额",
      value: formatMoney(availableIncome),
      icon: Wallet,
      highlight: true,
    },
  ];

  const totalPages = Math.max(
    1,
    Math.ceil(records.length / PROMOTION_RECORDS_PER_PAGE)
  );
  const pageRecords = records.slice(
    (currentPage - 1) * PROMOTION_RECORDS_PER_PAGE,
    currentPage * PROMOTION_RECORDS_PER_PAGE
  );
  const visibleRecordRows = [
    ...pageRecords.map((record) => ({ type: "record" as const, record })),
    ...Array.from(
      { length: PROMOTION_RECORDS_PER_PAGE - pageRecords.length },
      (_, index) => ({ type: "empty" as const, index })
    ),
  ];
  const pageStart = records.length
    ? (currentPage - 1) * PROMOTION_RECORDS_PER_PAGE + 1
    : 0;
  const pageEnd = Math.min(
    currentPage * PROMOTION_RECORDS_PER_PAGE,
    records.length
  );

  useEffect(() => {
    async function loadPromotionData() {
      setRecords([]);
      setVisitCount(0);
      setRegisterCount(0);
      setCurrentPage(1);

      if (!hasSupabaseConfig()) {
        setNotice("Supabase 未配置，暂时无法读取推广数据");
        setLoading(false);
        return;
      }

      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setProfile(null);
          setLoading(false);
          return;
        }

        const currentProfile = await getCurrentProfile();
        if (!currentProfile) {
          setLoading(false);
          return;
        }

        let nextProfile = currentProfile;
        if (!nextProfile.invite_code) {
          const generatedCode = createInviteCodeFromUserId(user.id);
          const { data: updatedProfile, error: updateError } = await supabase
            .from("profiles")
            .update({ invite_code: generatedCode })
            .eq("id", user.id)
            .select(
              "id,email,phone,role,balance,promotion_balance,invite_code,referred_by,created_at,updated_at"
            )
            .maybeSingle();

          if (updateError) {
            console.error("[Promotion] Failed to prepare invite code", updateError);
            nextProfile = { ...currentProfile, invite_code: generatedCode };
          } else if (updatedProfile) {
            nextProfile = {
              ...currentProfile,
              ...updatedProfile,
              balance: Number(updatedProfile.balance ?? 0),
              promotion_balance: Number(updatedProfile.promotion_balance ?? 0),
            };
          }
        }

        setProfile(nextProfile);

        const [{ count: visits }, { count: registrations }, { data: commissions }] =
          await Promise.all([
            supabase
              .from("promotion_visits")
              .select("id", { count: "exact", head: true })
              .eq("inviter_id", user.id),
            supabase
              .from("profiles")
              .select("id", { count: "exact", head: true })
              .eq("referred_by", user.id),
            supabase
              .from("promotion_commissions")
              .select(
                "id,referred_user_label,paid_at,recharge_amount,commission_amount,status"
              )
              .eq("inviter_id", user.id)
              .order("paid_at", { ascending: false }),
          ]);

        setVisitCount(visits ?? 0);
        setRegisterCount(registrations ?? 0);
        setRecords(
          (commissions ?? []).map((record: any) => ({
            id: String(record.id),
            userLabel: maskUserLabel(record.referred_user_label),
            paidAt: record.paid_at,
            rechargeAmount: Number(record.recharge_amount ?? 0),
            commissionAmount: Number(record.commission_amount ?? 0),
            status: record.status === "pending" ? "待确认" : "已确认",
          }))
        );
      } catch (error) {
        console.error("[Promotion] Failed to load promotion data", error);
        setNotice("推广数据读取失败，请稍后刷新重试");
      } finally {
        setLoading(false);
      }
    }

    loadPromotionData();
  }, []);

  const handleCopy = async () => {
    if (!promotionLink) return;

    await navigator.clipboard.writeText(shortLink || promotionLink);
    setCopied(true);
    setNotice(shortLink ? "短链接已复制" : "推广链接已复制");
    window.setTimeout(() => setCopied(false), 1800);
    window.setTimeout(() => setNotice(""), 2200);
  };

  const handleGenerateShortLink = async () => {
    if (!shortLinkBase) return;

    setShortLink(shortLinkBase);
    await navigator.clipboard.writeText(shortLinkBase);
    setCopied(true);
    setNotice("短链接已生成并复制");
    window.setTimeout(() => setCopied(false), 1800);
    window.setTimeout(() => setNotice(""), 2200);
  };

  const handleWithdraw = async () => {
    if (!profile) {
      setNotice("请先登录后再提现");
      window.setTimeout(() => setNotice(""), 2400);
      return;
    }

    if (availableIncome < PROMOTION_MIN_WITHDRAW_AMOUNT) {
      setNotice(`可用金额满 ${formatMoney(PROMOTION_MIN_WITHDRAW_AMOUNT)} 后可提现`);
      window.setTimeout(() => setNotice(""), 2400);
      return;
    }

    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.from("promotion_withdrawals").insert({
        user_id: profile.id,
        amount: availableIncome,
        status: "pending",
      });

      if (error) throw error;
      setNotice("提现申请已提交，处理后会同步到账户余额");
    } catch (error) {
      console.error("[Promotion] Failed to submit withdrawal", error);
      setNotice("提现申请提交失败，请稍后重试");
    }

    window.setTimeout(() => setNotice(""), 2400);
  };

  const content = useMemo(() => {
    if (loading) return null;

    if (!profile) {
      return (
        <Card className="border-border bg-white">
          <CardContent className="flex h-[calc(100dvh-120px)] flex-col items-center justify-center text-center">
            <h1 className="text-2xl font-semibold text-slate-950">
              登录后查看推广数据
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              推广链接、注册统计、佣金记录会和当前登录账号绑定。
            </p>
            <Button className="mt-6" asChild>
              <Link href="/login?redirect=/promotion">去登录</Link>
            </Button>
          </CardContent>
        </Card>
      );
    }

    return null;
  }, [loading, profile]);

  if (content) {
    return (
      <PublicLayout contentClassName="max-w-none overflow-hidden px-4 py-3 md:px-6">
        <div className="mx-auto max-w-[1500px]">{content}</div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout contentClassName="max-w-none overflow-hidden px-4 py-3 md:px-6">
      <div className="mx-auto grid h-[calc(100dvh-87px)] max-w-[1500px] grid-rows-[auto_minmax(0,1fr)] gap-4 overflow-hidden">
        <div className="grid gap-3 xl:grid-cols-[1fr_1fr]">
          <Card className="border-border bg-white">
            <CardContent className="p-3.5">
              <div className="mb-2.5 flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-semibold text-slate-950">推广链接</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    复制链接发送给好友，注册后自动绑定推广关系。
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Link2 className="h-5 w-5" />
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-2.5">
                <div className="min-w-0 flex-1 truncate text-sm text-slate-700">
                  {loading ? "正在加载推广链接..." : shortLink || promotionLink}
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!promotionLink}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="复制推广链接"
                >
                  {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>

              <div className="mt-2.5 grid gap-3 sm:grid-cols-[1fr_1fr_170px]">
                <div className="rounded-lg bg-orange-50 px-4 py-2">
                  <div className="text-xs text-muted-foreground">充值提佣倍率</div>
                  <div className="mt-1 text-lg font-semibold text-slate-950">
                    {(PROMOTION_COMMISSION_RATE * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="rounded-lg bg-orange-50 px-4 py-2">
                  <div className="text-xs text-muted-foreground">最低提现额</div>
                  <div className="mt-1 text-lg font-semibold text-slate-950">
                    {formatMoney(PROMOTION_MIN_WITHDRAW_AMOUNT)}
                  </div>
                </div>
                <Button
                  className="h-full min-h-0 rounded-lg text-sm"
                  onClick={handleGenerateShortLink}
                  disabled={!shortLinkBase}
                >
                  {shortLink ? "重新复制短链接" : "生成短链接"}
                </Button>
              </div>
              {notice ? (
                <div className="mt-2 text-xs font-medium text-primary">
                  {notice}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border bg-white">
            <CardContent className="p-3.5">
              <div className="mb-2.5 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">推广数据</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    推广访问、注册和佣金收益统计。
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="hidden text-sm font-medium text-red-500 md:inline">
                    只可提现到账户余额进行使用
                  </span>
                  <Button className="h-9 px-5" onClick={handleWithdraw}>
                    提现
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
                {promotionStats.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className="rounded-lg border border-border bg-slate-50/70 px-4 py-2"
                    >
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Icon className="h-3.5 w-3.5 text-primary" />
                        {item.label}
                      </div>
                      <div
                        className={
                          item.highlight
                            ? "mt-2 text-lg font-semibold text-blue-600"
                            : "mt-2 text-lg font-semibold text-slate-950"
                        }
                      >
                        {loading ? "-" : item.value}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="min-h-0 overflow-hidden border-border bg-white">
          <CardContent className="flex h-full min-h-0 flex-col p-4">
            <div className="mb-3 shrink-0">
              <h2 className="text-xl font-semibold text-slate-950">推广记录</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                推广用户后，用户每一次充值提成记录都会在这里展示。
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
              <table className="h-full w-full border-collapse text-sm">
                <thead className="bg-slate-50 text-muted-foreground">
                  <tr>
                    {tableHeaders.map((header) => (
                      <th
                        key={header}
                        className="border-b border-r border-border px-4 py-2.5 text-center font-semibold last:border-r-0"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {!loading && records.length === 0 ? (
                    <tr className="bg-slate-50/30">
                      <td
                        colSpan={tableHeaders.length}
                        className="border-t border-border px-4 py-8 text-center text-muted-foreground"
                      >
                        暂无真实推广记录
                      </td>
                    </tr>
                  ) : null}

                  {(records.length === 0 && !loading
                    ? visibleRecordRows.slice(1)
                    : visibleRecordRows
                  ).map((row, index) => {
                    if (row.type === "empty") {
                      return (
                        <tr
                          key={`empty-${currentPage}-${row.index}`}
                          className={index % 2 ? "bg-white" : "bg-slate-50/30"}
                        >
                          {tableHeaders.map((header, cellIndex) => (
                            <td
                              key={`${header}-empty-${cellIndex}`}
                              className="border-r border-t border-border px-4 py-2 text-center last:border-r-0"
                            >
                              &nbsp;
                            </td>
                          ))}
                        </tr>
                      );
                    }

                    const record = row.record;
                    const cells = [
                      record.userLabel,
                      formatDateTime(record.paidAt),
                      formatMoney(record.rechargeAmount),
                      formatMoney(record.commissionAmount),
                      record.status,
                    ];

                    return (
                      <tr
                        key={record.id}
                        className={index % 2 ? "bg-white" : "bg-slate-50/30"}
                      >
                        {cells.map((cell, cellIndex) => (
                          <td
                            key={`${record.id}-${cellIndex}`}
                            className={
                              cellIndex === 4
                                ? "border-t border-border px-4 py-2 text-center font-medium text-blue-600"
                                : "border-r border-t border-border px-4 py-2 text-center text-slate-700"
                            }
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <PromotionPagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalCount={records.length}
              pageStart={pageStart}
              pageEnd={pageEnd}
              onPageChange={setCurrentPage}
            />
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}

function PromotionPagination({
  currentPage,
  totalPages,
  totalCount,
  pageStart,
  pageEnd,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageStart: number;
  pageEnd: number;
  onPageChange: (page: number) => void;
}) {
  const [pageInput, setPageInput] = useState(String(currentPage));
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const jumpToPage = () => {
    const nextPage = Number(pageInput);
    if (!Number.isFinite(nextPage)) {
      setPageInput(String(currentPage));
      return;
    }
    onPageChange(Math.min(totalPages, Math.max(1, Math.trunc(nextPage))));
  };

  return (
    <div className="mt-3 flex shrink-0 flex-col gap-3 border-t border-border pt-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <div>
        共 {totalCount} 条记录
        {totalCount > 0 ? `，当前 ${pageStart}-${pageEnd} 条` : ""}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 rounded-md px-2"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {pages.map((page) => (
          <Button
            key={page}
            type="button"
            variant={page === currentPage ? "default" : "secondary"}
            size="sm"
            className="h-8 min-w-8 rounded-md px-3"
            onClick={() => onPageChange(page)}
          >
            {page}
          </Button>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 rounded-md px-2"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="ml-2">前往</span>
        <input
          value={pageInput}
          inputMode="numeric"
          onChange={(event) =>
            setPageInput(event.target.value.replace(/\D/g, ""))
          }
          onBlur={jumpToPage}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              jumpToPage();
            }
          }}
          className="h-8 w-14 rounded-full border border-border bg-slate-50 px-3 text-center text-slate-700 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
        />
        <span>页</span>
      </div>
    </div>
  );
}
