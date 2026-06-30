"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ClipboardList, RefreshCw, Search, ShieldCheck } from "lucide-react";

import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PublicOrder = {
  orderNo: string;
  status: string;
  paymentStatus: string;
  deliveryStatus: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  items: Array<{ productName: string; skuTitle: string | null; skuCode: string | null; quantity: number; unitPrice: number; lineTotal: number }>;
};

function formatMoney(value: number, currency: string) {
  return `${currency === "CNY" ? "¥" : `${currency} `}${Number(value ?? 0).toFixed(2)}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function statusLabel(value: string) {
  const map: Record<string, string> = {
    pending_payment: "待支付",
    paid: "已支付",
    processing: "处理中",
    delivered: "已发货",
    completed: "已完成",
    cancelled: "已取消",
    refunded: "已退款",
    failed: "处理失败",
    unpaid: "未支付",
  };
  return map[value] ?? (value || "—");
}

export default function OrderQueryPage() {
  const [orderNo, setOrderNo] = useState("");
  const [queryToken, setQueryToken] = useState("");
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setOrder(null);
    if (!orderNo.trim() || !queryToken.trim()) {
      setError("请输入订单号和查询凭证。");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/order-query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderNo: orderNo.trim(), queryToken: queryToken.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.order) {
        throw new Error(data.error || "订单信息或验证信息不正确");
      }
      setOrder(data.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : "订单查询失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PublicLayout contentClassName="bg-[#fbf7f1] p-0">
      <main className="mx-auto min-h-[calc(100vh-78px)] max-w-5xl px-5 py-8">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-slate-950">订单查询</h1>
          <p className="mt-2 text-sm text-slate-500">未登录查询必须同时提供订单号和安全查询凭证。仅凭订单号无法查看订单。</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[420px_minmax(0,1fr)]">
          <section className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold text-slate-950">安全验证</div>
                <div className="text-xs text-slate-500">查询失败不会提示订单是否存在。</div>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">订单号</label>
                <Input value={orderNo} onChange={(event) => setOrderNo(event.target.value)} placeholder="例如 JL202606..." autoComplete="off" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">安全查询凭证</label>
                <Input value={queryToken} onChange={(event) => setQueryToken(event.target.value)} placeholder="请输入订单查询凭证" type="password" autoComplete="off" />
                <p className="mt-1 text-xs text-slate-500">查询凭证不会以明文保存。历史订单如果未生成凭证，请登录账号后在用户中心查看。</p>
              </div>
              {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                {loading ? "查询中..." : "查询订单"}
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/login?redirect=/account/orders">登录后查看我的订单</Link>
              </Button>
            </form>
          </section>

          <section className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
            {!order ? (
              <div className="flex min-h-[360px] flex-col items-center justify-center text-center text-slate-500">
                <ClipboardList className="mb-3 h-10 w-10 text-orange-400" />
                <div className="font-semibold text-slate-900">等待查询</div>
                <p className="mt-2 max-w-sm text-sm">请输入订单号和安全查询凭证。查询成功后这里只显示订单最小必要信息，不展示个人资料和完整交付内容。</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-orange-100 pb-4">
                  <div>
                    <div className="text-sm text-slate-500">订单号</div>
                    <div className="mt-1 break-all font-mono text-lg font-semibold text-slate-950">{order.orderNo}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-slate-500">订单金额</div>
                    <div className="mt-1 text-xl font-bold text-orange-600">{formatMoney(order.totalAmount, order.currency)}</div>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Info label="订单状态" value={statusLabel(order.status)} />
                  <Info label="支付状态" value={statusLabel(order.paymentStatus)} />
                  <Info label="交付状态" value={statusLabel(order.deliveryStatus)} />
                  <Info label="创建时间" value={formatDate(order.createdAt)} />
                  <Info label="最近更新" value={formatDate(order.updatedAt)} />
                </div>
                <div>
                  <div className="mb-2 font-semibold text-slate-900">商品信息</div>
                  <div className="space-y-2">
                    {order.items.map((item, index) => (
                      <div key={`${item.productName}-${index}`} className="rounded-xl border border-orange-100 bg-orange-50/30 p-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-slate-900">{item.productName}</div>
                            {item.skuTitle ? <div className="mt-1 truncate text-xs text-slate-500">规格：{item.skuTitle}</div> : null}
                            {item.skuCode ? <div className="mt-1 truncate text-xs text-slate-500">SKU：{item.skuCode}</div> : null}
                          </div>
                          <div className="shrink-0 text-sm sm:text-right">
                            <div>{formatMoney(item.lineTotal, order.currency)}</div>
                            <div className="text-xs text-slate-500">x {item.quantity}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  为保护隐私，未登录查询不会展示完整邮箱、手机号、用户 ID、支付原始参数、余额流水、后台备注或完整数字交付内容。请登录后查看完整订单和交付信息。
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </PublicLayout>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-medium text-slate-900">{value}</div>
    </div>
  );
}




