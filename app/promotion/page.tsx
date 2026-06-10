"use client";

import { useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  Copy,
  DollarSign,
  Link2,
  Percent,
  Users,
  Wallet,
} from "lucide-react";

import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const promotionLink = "https://www.jianlian.shop/register?invite=JL8XCP";

const promotionStats = [
  { label: "访问量", value: "26", icon: BarChart3 },
  { label: "注册", value: "8", icon: Users },
  { label: "推荐人", value: "8", icon: Users },
  { label: "注册率", value: "30.77%", icon: Percent },
  { label: "总收入", value: "¥ 0.00", icon: DollarSign },
  { label: "可用金额", value: "¥ 1.20", icon: Wallet, highlight: true },
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

export default function PromotionPage() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(promotionLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <PublicLayout contentClassName="p-4 md:p-3 max-w-[1540px] mx-auto mt-12 md:mt-0 md:h-[calc(100vh-62px)] md:overflow-hidden">
      <div className="grid gap-3 md:h-full md:grid-rows-[auto_1fr]">
        <div className="grid gap-3 xl:grid-cols-[1fr_1fr]">
          <Card className="border-border bg-white">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between">
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

              <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-3">
                <div className="min-w-0 flex-1 truncate text-sm text-slate-700">
                  {promotionLink}
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

              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_170px]">
                <div className="rounded-lg bg-orange-50 px-4 py-2.5">
                  <div className="text-xs text-muted-foreground">充值提佣倍率</div>
                  <div className="mt-1 text-lg font-semibold text-slate-950">3%</div>
                </div>
                <div className="rounded-lg bg-orange-50 px-4 py-2.5">
                  <div className="text-xs text-muted-foreground">最低提现额</div>
                  <div className="mt-1 text-lg font-semibold text-slate-950">¥ 10</div>
                </div>
                <Button className="h-full min-h-0 rounded-lg text-sm">
                  生成短链接
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-white">
            <CardContent className="p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
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
                  <Button className="h-9 px-5">提现</Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
                {promotionStats.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className="rounded-lg border border-border bg-slate-50/70 px-4 py-2.5"
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

        <Card className="min-h-0 border-border bg-white">
          <CardContent className="flex h-full min-h-0 flex-col p-4">
            <div className="mb-3">
              <h2 className="text-xl font-semibold text-slate-950">推广记录</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                推广用户后，用户每一次充值提成记录都会在这里展示。
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
              <table className="w-full border-collapse text-sm">
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
                  {promotionRecords.map((record, index) => (
                    <tr
                      key={`${record[0]}-${record[1]}`}
                      className={index % 2 ? "bg-white" : "bg-slate-50/30"}
                    >
                      {record.map((cell, cellIndex) => (
                        <td
                          key={`${record[1]}-${cellIndex}`}
                          className={
                            cellIndex === 4
                              ? "border-t border-border px-4 py-2.5 text-center font-medium text-blue-600"
                              : "border-r border-t border-border px-4 py-2.5 text-center text-slate-700"
                          }
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center justify-end gap-2 text-sm text-muted-foreground">
              <button className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-400">
                ‹
              </button>
              <button className="flex h-8 min-w-8 items-center justify-center rounded-md bg-primary px-3 font-semibold text-white">
                1
              </button>
              <button className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-400">
                ›
              </button>
              <span className="ml-4">前往</span>
              <span className="flex h-8 min-w-12 items-center justify-center rounded-full border border-border bg-slate-50 px-3 text-slate-700">
                1
              </span>
              <span>页</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}
