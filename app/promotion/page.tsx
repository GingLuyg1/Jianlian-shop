"use client";

import { useEffect, useState } from "react";
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

import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const promotionLink = "https://www.jianlian.shop/register?invite=JL8XCP";
const shortLinkBase = "https://jianlian.shop/r/JL8XCP";
const minWithdrawAmount = 10;

type PromotionStat = {
  label: string;
  value: string;
  icon: LucideIcon;
  highlight?: boolean;
};

const basePromotionStats: PromotionStat[] = [
  { label: "访问量", value: "26", icon: BarChart3 },
  { label: "注册", value: "8", icon: Users },
  { label: "推荐人", value: "8", icon: Users },
  { label: "注册率", value: "30.77%", icon: Percent },
];

const promotionRecords = [
  ["136****6514", "2025-11-26 00:31:37", "¥ 20.00", "¥ 0.60", "已确认"],
  ["177****4453", "2026-04-25 15:39:45", "¥ 20.00", "¥ 0.60", "已确认"],
  ["177****4453", "2025-12-14 22:21:03", "¥ 20.00", "¥ 0.60", "已确认"],
  ["177****4453", "2025-11-25 15:47:34", "¥ 20.00", "¥ 0.60", "已确认"],
  ["188****0927", "2025-10-18 18:22:09", "¥ 50.00", "¥ 1.50", "已确认"],
  ["155****7318", "2025-09-30 09:12:44", "¥ 30.00", "¥ 0.90", "已确认"],
  ["166****2841", "2025-09-12 21:08:16", "¥ 20.00", "¥ 0.60", "已确认"],
  ["139****6042", "2025-08-28 13:36:51", "¥ 100.00", "¥ 3.00", "已确认"],
];

const tableHeaders = ["用户名", "支付时间", "充值金额", "佣金变动", "付款状态"];
const RECORDS_PER_PAGE = 7;

export default function PromotionPage() {
  const [copied, setCopied] = useState(false);
  const [shortLink, setShortLink] = useState("");
  const [notice, setNotice] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const totalIncome = promotionRecords.reduce(
    (sum, record) => sum + parseMoney(record[3]),
    0
  );
  const usedIncome = 0;
  const availableIncome = Math.max(0, totalIncome - usedIncome);
  const promotionStats: PromotionStat[] = [
    ...basePromotionStats,
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
    Math.ceil(promotionRecords.length / RECORDS_PER_PAGE)
  );
  const pageRecords = promotionRecords.slice(
    (currentPage - 1) * RECORDS_PER_PAGE,
    currentPage * RECORDS_PER_PAGE
  );
  const visibleRecordRows = [
    ...pageRecords.map((record) => ({ type: "record" as const, record })),
    ...Array.from(
      { length: RECORDS_PER_PAGE - pageRecords.length },
      (_, index) => ({ type: "empty" as const, index })
    ),
  ];
  const pageStart = promotionRecords.length
    ? (currentPage - 1) * RECORDS_PER_PAGE + 1
    : 0;
  const pageEnd = Math.min(
    currentPage * RECORDS_PER_PAGE,
    promotionRecords.length
  );

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shortLink || promotionLink);
    setCopied(true);
    setNotice(shortLink ? "短链接已复制" : "推广链接已复制");
    window.setTimeout(() => setCopied(false), 1800);
    window.setTimeout(() => setNotice(""), 2200);
  };

  const handleGenerateShortLink = async () => {
    setShortLink(shortLinkBase);
    await navigator.clipboard.writeText(shortLinkBase);
    setCopied(true);
    setNotice("短链接已生成并复制");
    window.setTimeout(() => setCopied(false), 1800);
    window.setTimeout(() => setNotice(""), 2200);
  };

  const handleWithdraw = () => {
    if (availableIncome < minWithdrawAmount) {
      setNotice(`可用金额满 ${formatMoney(minWithdrawAmount)} 后可提现`);
      window.setTimeout(() => setNotice(""), 2400);
      return;
    }

    setNotice("提现申请已提交，到账后会同步到账户余额");
    window.setTimeout(() => setNotice(""), 2400);
  };

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
                  {shortLink || promotionLink}
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-white transition-colors hover:bg-primary/90"
                  aria-label="复制推广链接"
                >
                  {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>

              <div className="mt-2.5 grid gap-3 sm:grid-cols-[1fr_1fr_170px]">
                <div className="rounded-lg bg-orange-50 px-4 py-2">
                  <div className="text-xs text-muted-foreground">充值提佣倍率</div>
                  <div className="mt-1 text-lg font-semibold text-slate-950">3%</div>
                </div>
                <div className="rounded-lg bg-orange-50 px-4 py-2">
                  <div className="text-xs text-muted-foreground">最低提现额</div>
                  <div className="mt-1 text-lg font-semibold text-slate-950">¥ 10</div>
                </div>
                <Button
                  className="h-full min-h-0 rounded-lg text-sm"
                  onClick={handleGenerateShortLink}
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
                        {item.value}
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
                  {visibleRecordRows.map((row, index) => {
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

                    return (
                      <tr
                        key={`${record[0]}-${record[1]}`}
                        className={index % 2 ? "bg-white" : "bg-slate-50/30"}
                      >
                        {record.map((cell, cellIndex) => (
                          <td
                            key={`${record[1]}-${cellIndex}`}
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
              totalCount={promotionRecords.length}
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

function parseMoney(value: string) {
  const amount = value.match(/\d+(?:\.\d+)?/);
  return amount ? Number(amount[0]) : 0;
}

function formatMoney(value: number) {
  return `¥ ${value.toFixed(2)}`;
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
