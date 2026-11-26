"use client";

import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ClipboardList, Headphones, KeyRound, Mail, RefreshCw, Search, ShieldCheck } from "lucide-react";

import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchWithTimeout } from "@/lib/network/fetch-with-timeout";
import { openPublicSupport } from "@/lib/support/open-public-support";
import { cn } from "@/lib/utils";

type PublicOrder = {
  orderNo: string;
  status: string;
  paymentStatus: string;
  deliveryStatus: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    productName: string;
    skuTitle: string | null;
    skuCode: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
};

type QueryTab = "email" | "token";

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
    pending: "待处理",
  };
  return map[value] ?? (value || "—");
}

function statusBadgeTone(status: string) {
  if (status === "delivered" || status === "completed" || status === "paid") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "pending_payment" || status === "processing") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (status === "cancelled" || status === "failed") {
    return "border-slate-200 bg-slate-100 text-slate-600";
  }
  return "border-orange-200 bg-orange-50 text-orange-700";
}

export default function OrderQueryPage() {
  return (
    <Suspense fallback={<div className="px-5 py-8 text-center text-sm text-muted-foreground">订单查询加载中...</div>}>
      <OrderQueryContent />
    </Suspense>
  );
}

function OrderQueryContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<QueryTab>("email");
  const [email, setEmail] = useState("");

  const [orderNo, setOrderNo] = useState("");
  const [queryToken, setQueryToken] = useState("");
  const [orders, setOrders] = useState<PublicOrder[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submitLockRef = useRef(false);

  useEffect(() => {
    const initialOrderNo = (
      searchParams.get("orderNo") ||
      searchParams.get("order_no") ||
      searchParams.get("order") ||
      ""
    ).trim();
    const initialEmail = (searchParams.get("email") || "").trim();
    if (initialOrderNo) {
      setOrderNo((prev) => prev || initialOrderNo);
      setActiveTab("token");
    } else if (initialEmail) {
      setEmail((prev) => prev || initialEmail);
      setActiveTab("email");
    }
  }, [searchParams]);

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || submitLockRef.current) return;
    setError("");
    setOrders([]);
    setHasSearched(false);

    const normalizedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("请输入下单时填写的有效联系邮箱。");
      return;
    }

    submitLockRef.current = true;
    setLoading(true);
    try {
      const response = await fetchWithTimeout("/api/order-query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "email",
          email: normalizedEmail,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "订单查询失败，请稍后重试");
      }
      setOrders(Array.isArray(data.orders) ? data.orders : []);
      setHasSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "订单查询失败，请稍后重试");
    } finally {
      submitLockRef.current = false;
      setLoading(false);
    }
  }

  async function handleTokenSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || submitLockRef.current) return;
    setError("");
    setOrders([]);
    setHasSearched(false);

    if (!orderNo.trim() || !queryToken.trim()) {
      setError("请输入订单号和查询凭证。");
      return;
    }
    submitLockRef.current = true;
    setLoading(true);
    try {
      const response = await fetchWithTimeout("/api/order-query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderNo: orderNo.trim(), queryToken: queryToken.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.order) {
        throw new Error(data.error || "订单信息或验证信息不正确");
      }
      setOrders([data.order]);
      setHasSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "订单查询失败，请稍后重试");
    } finally {
      submitLockRef.current = false;
      setLoading(false);
    }
  }

  return (
    <PublicLayout contentClassName="bg-[#fbf7f1] p-0">
      <div className="mx-auto min-h-[calc(100vh-78px)] max-w-5xl px-5 py-8">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-slate-950">订单查询</h1>
          <p className="mt-2 text-sm text-slate-500">
            游客可通过下单邮箱完成安全验证查询最近订单，或使用订单号 + 安全查询凭证查单。仅凭订单号无法查看订单。
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[420px_minmax(0,1fr)]">
          <section className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
            <div className="mb-4 grid grid-cols-2 gap-1.5 rounded-xl bg-orange-50/70 p-1">
              <button
                type="button"
                data-testid="order-query-tab-email"
                onClick={() => {
                  setActiveTab("email");
                  setError("");
                }}
                className={cn(
                  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition",
                  activeTab === "email"
                    ? "bg-white text-primary shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <Mail className="h-3.5 w-3.5" />
                游客邮箱查单
              </button>
              <button
                type="button"
                data-testid="order-query-tab-token"
                onClick={() => {
                  setActiveTab("token");
                  setError("");
                }}
                className={cn(
                  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition",
                  activeTab === "token"
                    ? "bg-white text-primary shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <KeyRound className="h-3.5 w-3.5" />
                订单号+凭证查单
              </button>
            </div>

            {activeTab === "email" ? (
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-950">游客邮箱安全查单</div>
                    <div className="text-xs text-slate-500">输入下单时绑定的收货/接收邮箱即可查看订单进度。</div>
                  </div>
                </div>

                <div>
                  <label htmlFor="guest-query-email" className="mb-1 block text-sm font-medium text-slate-700">
                    下单邮箱
                  </label>
                  <Input
                    id="guest-query-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="请输入下单时填写的邮箱地址"
                    autoComplete="email"
                  />
                </div>

                <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-700">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span>已启用安全频控保护（查询结果仅显示必要订单信息，不展示明文卡密）</span>
                </div>

                {error ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}

                <Button className="w-full" type="submit" disabled={loading}>
                  {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  {loading ? "查询中..." : "查询邮箱订单"}
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/login?redirect=/account/orders">登录后查看完整订单与卡密</Link>
                </Button>
              </form>
            ) : (
              <form onSubmit={handleTokenSubmit} className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-950">凭证精准查单</div>
                    <div className="text-xs text-slate-500">查询失败不会提示订单是否存在。</div>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">订单号</label>
                  <Input
                    value={orderNo}
                    onChange={(event) => setOrderNo(event.target.value)}
                    placeholder="例如 JL202606..."
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">安全查询凭证</label>
                  <Input
                    value={queryToken}
                    onChange={(event) => setQueryToken(event.target.value)}
                    placeholder="请输入订单查询凭证"
                    type="password"
                    autoComplete="off"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    查询凭证不会以明文保存。历史订单如果未生成凭证，请使用左侧邮箱查单或登录用户中心查看。
                  </p>
                </div>
                {error ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}
                <Button className="w-full" type="submit" disabled={loading}>
                  {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  {loading ? "查询中..." : "查询订单"}
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/login?redirect=/account/orders">登录后查看我的订单</Link>
                </Button>
              </form>
            )}
          </section>

          <section className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
            {!hasSearched ? (
              <div className="flex min-h-[360px] flex-col items-center justify-center text-center text-slate-500">
                <ClipboardList className="mb-3 h-10 w-10 text-orange-400" />
                <div className="font-semibold text-slate-900">等待查询</div>
                <p className="mt-2 max-w-sm text-sm">
                  输入下单邮箱或「订单号 + 查询凭证」即可查看订单状态。为保护隐私，未登录查单仅展示订单最小必要信息，卡密请查收邮件或联系客服核对。
                </p>
              </div>
            ) : orders.length === 0 ? (
              <div className="flex min-h-[360px] flex-col items-center justify-center text-center text-slate-500">
                <ClipboardList className="mb-3 h-10 w-10 text-slate-300" />
                <div className="font-semibold text-slate-900">未查询到相关订单</div>
                <p className="mt-2 max-w-sm text-sm">
                  请核对下单时填写的邮箱是否拼写一致；如已付款仍未查到，请联系在线客服并提供付款截图协助核查。
                </p>
                <Button variant="outline" size="sm" className="mt-4" onClick={openPublicSupport}>
                  <Headphones className="mr-1.5 h-3.5 w-3.5" />
                  联系在线客服
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-orange-100 pb-3">
                  <div className="text-sm font-semibold text-slate-900">
                    共查询到 {orders.length} 笔订单
                  </div>
                  <button
                    type="button"
                    onClick={openPublicSupport}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <Headphones className="h-3.5 w-3.5" />
                    需要人工协助？联系客服
                  </button>
                </div>

                <div className="space-y-4">
                  {orders.map((order) => (
                    <div
                      key={order.orderNo}
                      className="space-y-4 rounded-2xl border border-orange-100 bg-[#fffdfb] p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-orange-100/80 pb-3">
                        <div>
                          <div className="text-xs text-slate-500">订单号</div>
                          <div className="mt-0.5 break-all font-mono text-base font-semibold text-slate-950">
                            {order.orderNo}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                              statusBadgeTone(order.status)
                            )}
                          >
                            {statusLabel(order.status)}
                          </span>
                          <div className="text-lg font-bold text-orange-600">
                            {formatMoney(order.totalAmount, order.currency)}
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-2.5 sm:grid-cols-3">
                        <Info label="支付状态" value={statusLabel(order.paymentStatus)} />
                        <Info label="交付状态" value={statusLabel(order.deliveryStatus)} />
                        <Info label="下单时间" value={formatDate(order.createdAt)} />
                      </div>

                      <div className="space-y-2">
                        {order.items.map((item, index) => (
                          <div
                            key={`${order.orderNo}-${item.productName}-${index}`}
                            className="rounded-xl border border-orange-100 bg-orange-50/30 p-3"
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="truncate font-medium text-slate-900">{item.productName}</div>
                                {item.skuTitle ? (
                                  <div className="mt-1 truncate text-xs text-slate-500">规格：{item.skuTitle}</div>
                                ) : null}
                                {item.skuCode ? (
                                  <div className="mt-0.5 truncate text-xs text-slate-500">SKU：{item.skuCode}</div>
                                ) : null}
                              </div>
                              <div className="shrink-0 text-sm sm:text-right">
                                <div className="font-semibold text-slate-900">
                                  {formatMoney(item.lineTotal, order.currency)}
                                </div>
                                <div className="text-xs text-slate-500">x {item.quantity}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <span className="text-xs text-slate-500">
                          最近更新：{formatDate(order.updatedAt)}
                        </span>
                        <div className="flex items-center gap-2">
                          {order.status === "pending_payment" && order.paymentStatus !== "paid" ? (
                            <Button asChild size="sm">
                              <Link href={`/payment?order=${encodeURIComponent(order.orderNo)}`}>前往支付</Link>
                            </Button>
                          ) : null}
                          <Button type="button" size="sm" variant="outline" onClick={openPublicSupport}>
                            联系客服
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                  为保护隐私，未登录查询不会展示完整邮箱、手机号、用户 ID、支付原始参数、余额流水、后台备注或完整数字交付内容。发货成功后卡密会自动发送至您的下单邮箱；如需重发或核对，可登录账号或联系在线客服。
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </PublicLayout>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}
