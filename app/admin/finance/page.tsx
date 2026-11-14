"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Download,
  ExternalLink,
  Landmark,
  Loader2,
  Receipt,
  RefreshCcw,
  ShieldCheck,
  TrendingUp,
  WalletCards,
} from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import {
  AdminDateRangeFilter,
  getPresetDateRange,
  type DashboardDateFilterValue,
} from "@/components/admin/dashboard/AdminDateRangeFilter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { listProducts, type AdminProduct } from "@/lib/supabase/admin-catalog";
import { cn } from "@/lib/utils";

type RawOrder = {
  id: string;
  order_no: string;
  customer_email: string | null;
  total_amount: number | string | null;
  payment_status: string;
  created_at: string;
};

type RawRecharge = {
  id: string;
  recharge_no: string;
  user_email: string | null;
  amount: number | string | null;
  credited_amount: number | string | null;
  channel_code: string | null;
  status: string;
  created_at: string;
};

type RawOrderItem = {
  order_id: string;
  product_id: string | null;
  product_name: string | null;
  quantity: number | string | null;
  line_total: number | string | null;
  created_at: string;
};

type ChannelConfig = {
  code: string;
  label: string;
};

const CHANNELS: ChannelConfig[] = [
  { code: "alipay", label: "支付宝" },
  { code: "wechat", label: "微信支付" },
  { code: "usdt_trc20", label: "USDT-TRC20" },
  { code: "usdt_bep20", label: "USDT-BEP20" },
];

function formatMoney(amount: number) {
  return `¥${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function safeNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function AdminFinancePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateFilter, setDateFilter] = useState<DashboardDateFilterValue>(() => getPresetDateRange("today"));
  const [orders, setOrders] = useState<RawOrder[]>([]);
  const [recharges, setRecharges] = useState<RawRecharge[]>([]);
  const [orderItems, setOrderItems] = useState<RawOrderItem[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [sessions, setSessions] = useState<Array<{ channel_code?: string; status?: string; payable_amount?: number; created_at?: string }>>([]);
  const [productSortBy, setProductSortBy] = useState<"sales" | "profit" | "margin" | "cost">("sales");

  const loadFinanceData = useCallback(async () => {
    setLoading(true);
    setError("");
    if (!hasSupabaseConfig()) {
      setError("Supabase 未配置，暂时无法加载财务数据。");
      setLoading(false);
      return;
    }

    try {
      const supabase = getSupabaseBrowserClient();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 90);

      const [ordersRes, rechargesRes, productsRes, orderItemsRes, sessionsRes] = await Promise.allSettled([
        supabase
          .from("orders")
          .select("id,order_no,customer_email,total_amount,payment_status,created_at")
          .gte("created_at", thirtyDaysAgo.toISOString())
          .order("created_at", { ascending: false }),
        supabase
          .from("account_recharges")
          .select("id,recharge_no,user_email,amount,credited_amount,channel_code,status,created_at")
          .gte("created_at", thirtyDaysAgo.toISOString())
          .order("created_at", { ascending: false }),
        listProducts({ page: 1, pageSize: 500, sortBy: "updated_at" }),
        supabase
          .from("order_items")
          .select("order_id,product_id,product_name,quantity,line_total,created_at")
          .gte("created_at", thirtyDaysAgo.toISOString()),
        supabase
          .from("payment_sessions")
          .select("channel_code,status,payable_amount,created_at")
          .gte("created_at", thirtyDaysAgo.toISOString()),
      ]);

      if (ordersRes.status === "fulfilled" && !ordersRes.value.error) {
        setOrders((ordersRes.value.data ?? []) as RawOrder[]);
      }
      if (rechargesRes.status === "fulfilled" && !rechargesRes.value.error) {
        setRecharges((rechargesRes.value.data ?? []) as RawRecharge[]);
      }
      if (productsRes.status === "fulfilled") {
        setProducts(productsRes.value.products ?? []);
      }
      if (orderItemsRes.status === "fulfilled" && !orderItemsRes.value.error) {
        setOrderItems((orderItemsRes.value.data ?? []) as RawOrderItem[]);
      }
      if (sessionsRes.status === "fulfilled" && !sessionsRes.value.error) {
        setSessions((sessionsRes.value.data ?? []) as any[]);
      }
    } catch (err) {
      console.error("[AdminFinance] load error", err);
      setError("财务数据读取失败，请检查网络后重试。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFinanceData();
  }, [loadFinanceData]);

  const fromDateStr = dateFilter.from.toISOString().slice(0, 10);
  const toDateStr = dateFilter.to.toISOString().slice(0, 10);

  const inRange = useCallback(
    (iso?: string | null) => {
      if (!iso) return false;
      const d = iso.slice(0, 10);
      return d >= fromDateStr && d <= toDateStr;
    },
    [fromDateStr, toDateStr]
  );

  const periodLabel =
    dateFilter.preset === "today"
      ? "今日"
      : dateFilter.preset === "yesterday"
        ? "昨日"
        : dateFilter.preset === "7d"
          ? "近 7 天"
          : dateFilter.preset === "30d"
            ? "近 30 天"
            : "所选时段";

  const metrics = useMemo(() => {
    const rangeOrders = orders.filter((o) => inRange(o.created_at) && o.payment_status === "paid");
    const paidOrderIds = new Set(rangeOrders.map((o) => o.id));
    const rangeGmv = rangeOrders.reduce((sum, o) => sum + safeNumber(o.total_amount), 0);

    const rangeRecharges = recharges.filter((r) => inRange(r.created_at) && r.status === "paid");
    const rangeRechargeAmount = rangeRecharges.reduce(
      (sum, r) => sum + safeNumber(r.credited_amount ?? r.amount),
      0
    );

    const totalRevenue = rangeGmv + rangeRechargeAmount;

    const rangeItems = orderItems.filter((i) => inRange(i.created_at) && paidOrderIds.has(i.order_id));
    const productMap = new Map(products.map((p) => [p.id, p]));

    let totalCost = 0;
    const costMap = new Map<
      string,
      {
        id: string;
        name: string;
        price: number;
        cost: number;
        quantity: number;
        sales: number;
        totalCost: number;
        profit: number;
        margin: number;
      }
    >();

    for (const item of rangeItems) {
      const pid = item.product_id ?? "";
      const p = productMap.get(pid);
      const unitCost = Number(p?.original_price ?? 0);
      const qty = safeNumber(item.quantity);
      const lineTotal = safeNumber(item.line_total);
      const lineCost = unitCost * qty;
      totalCost += lineCost;

      const cur = costMap.get(pid) ?? {
        id: pid,
        name: p?.name ?? item.product_name ?? "未知商品",
        price: Number(p?.price ?? 0),
        cost: unitCost,
        quantity: 0,
        sales: 0,
        totalCost: 0,
        profit: 0,
        margin: 0,
      };
      cur.quantity += qty;
      cur.sales += lineTotal;
      cur.totalCost += lineCost;
      cur.profit = cur.sales - cur.totalCost;
      cur.margin = cur.sales > 0 ? (cur.profit / cur.sales) * 100 : 0;
      costMap.set(pid, cur);
    }

    const grossProfit = rangeGmv - totalCost;
    const grossMargin = rangeGmv > 0 ? (grossProfit / rangeGmv) * 100 : 0;
    const gatewayFee = Number((rangeGmv * 0.03).toFixed(2));
    const netProfit = grossProfit - gatewayFee;

    const productList = Array.from(costMap.values()).sort((a, b) => {
      if (productSortBy === "profit") return b.profit - a.profit;
      if (productSortBy === "margin") return b.margin - a.margin;
      if (productSortBy === "cost") return b.totalCost - a.totalCost;
      return b.sales - a.sales;
    });

    const rangeSessions = sessions.filter((s) => inRange(s.created_at) && s.status === "paid");
    const channelStats = CHANNELS.map((ch) => {
      const s = rangeSessions.filter((row) => row.channel_code === ch.code);
      const count = s.length;
      const amount = s.reduce((sum, row) => sum + safeNumber(row.payable_amount), 0);
      const fee = Number((amount * 0.03).toFixed(2));
      const net = amount - fee;
      return {
        ...ch,
        count,
        amount,
        fee,
        net,
      };
    });

    return {
      rangeGmv,
      rangeRechargeAmount,
      totalRevenue,
      paidOrderCount: rangeOrders.length,
      paidRechargeCount: rangeRecharges.length,
      totalCost,
      grossProfit,
      grossMargin: `${grossMargin.toFixed(1)}%`,
      gatewayFee,
      netProfit,
      productList,
      channelStats,
    };
  }, [inRange, orderItems, orders, productSortBy, products, recharges, sessions]);

  return (
    <AdminPageShell
      title="财务收支与成本对账"
      description="全站营收流水、已售商品成本核算、综合毛利率测算、第三方支付通道费及各渠道结算对账全景。"
      actions={
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/payments">
              <CreditCard className="mr-1.5 h-3.5 w-3.5" /> 支付对账服务
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/balance-ledger">
              <WalletCards className="mr-1.5 h-3.5 w-3.5" /> 余额流水
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => void loadFinanceData()} disabled={loading}>
            {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />}
            刷新
          </Button>
        </div>
      }
    >
      {error ? (
        <AdminErrorState description={error} onRetry={() => void loadFinanceData()} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden pb-1 h-[calc(100vh-var(--admin-header-height)-36px)]">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                <Landmark className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">财务经营总览</h2>
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                    {periodLabel}
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  {fromDateStr} ~ {toDateStr} · 实时数据对账
                </div>
              </div>
            </div>
            <AdminDateRangeFilter value={dateFilter} onChange={setDateFilter} />
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="text-xs text-slate-500">全站总营收流水</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                {loading ? "…" : formatMoney(metrics.totalRevenue)}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400">
                订单 {formatMoney(metrics.rangeGmv)} + 充值 {formatMoney(metrics.rangeRechargeAmount)}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="text-xs text-slate-500">已售商品估算成本</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                {loading ? "…" : formatMoney(metrics.totalCost)}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400">
                基于已配置规格原价/供货底价
              </div>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 shadow-sm">
              <div className="text-xs font-medium text-emerald-800">预估商品毛利</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-emerald-700">
                {loading ? "…" : formatMoney(metrics.grossProfit)}
              </div>
              <div className="mt-0.5 text-[10px] text-emerald-600/80">
                订单 GMV - 商品总成本
              </div>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 shadow-sm">
              <div className="text-xs font-medium text-blue-800">综合毛利率</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-blue-700">
                {loading ? "…" : metrics.grossMargin}
              </div>
              <div className="mt-0.5 text-[10px] text-blue-600/80">
                商品毛利 / 订单 GMV
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 shadow-sm">
              <div className="text-xs font-medium text-amber-800">支付通道手续费 (约 3%)</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-amber-700">
                {loading ? "…" : formatMoney(metrics.gatewayFee)}
              </div>
              <div className="mt-0.5 text-[10px] text-amber-600/80">
                第三方支付平台结算扣费
              </div>
            </div>

            <div className="rounded-xl border border-emerald-300 bg-gradient-to-br from-emerald-100/60 to-white p-3 shadow-sm">
              <div className="text-xs font-semibold text-emerald-900">预估净利润</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-emerald-800">
                {loading ? "…" : formatMoney(metrics.netProfit)}
              </div>
              <div className="mt-0.5 text-[10px] text-emerald-700/80">
                扣除商品成本与通道手续费
              </div>
            </div>
          </div>

          <Tabs defaultValue="products" className="flex min-h-0 flex-1 flex-col space-y-2">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
              <TabsList className="bg-slate-100 p-1">
                <TabsTrigger value="products">已售商品成本与毛利明细</TabsTrigger>
                <TabsTrigger value="channels">支付渠道交易与通道费</TabsTrigger>
                <TabsTrigger value="recharge">充值流水与资金沉淀</TabsTrigger>
              </TabsList>
              <div className="text-xs text-slate-400">
                🔒 安全提示：产品成本与原价数据仅在管理员后台财务与商品编辑页呈现，前台买家端不可见。
              </div>
            </div>

            <TabsContent value="products" className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden mt-0">
              <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border border-slate-200 shadow-none">
                <CardHeader className="flex shrink-0 flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base">已售商品成本与利润测算表</CardTitle>
                    <p className="text-xs text-slate-500">
                      {periodLabel}共有 {metrics.productList.length} 款商品产生成交，成本基于 SKU 原价/供货底价核算
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">排序：</span>
                    <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
                      {(
                        [
                          { key: "sales", label: "销售额" },
                          { key: "profit", label: "毛利额" },
                          { key: "margin", label: "毛利率" },
                          { key: "cost", label: "总成本" },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setProductSortBy(opt.key)}
                          className={cn(
                            "rounded px-2 py-0.5 text-xs font-medium transition-colors",
                            productSortBy === opt.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-0">
                  {loading ? (
                    <div className="space-y-2 py-4">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />
                      ))}
                    </div>
                  ) : metrics.productList.length === 0 ? (
                    <AdminEmptyState title="当前时段暂无已售商品数据" description="所选日期范围内暂无付款成功的商品订单记录。" />
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="text-xs">
                            <TableHead className="min-w-[180px]">商品名称</TableHead>
                            <TableHead className="text-right">在售价</TableHead>
                            <TableHead className="text-right">成本底价 (原价)</TableHead>
                            <TableHead className="text-right">销量</TableHead>
                            <TableHead className="text-right">销售额</TableHead>
                            <TableHead className="text-right">总成本</TableHead>
                            <TableHead className="text-right">预估毛利</TableHead>
                            <TableHead className="text-right">毛利率</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {metrics.productList.map((item) => (
                            <TableRow key={item.id} className="text-xs">
                              <TableCell className="max-w-[220px] truncate font-medium text-slate-900" title={item.name}>
                                {item.name}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-slate-700">{formatMoney(item.price)}</TableCell>
                              <TableCell className="text-right tabular-nums text-slate-500">
                                {item.cost > 0 ? formatMoney(item.cost) : <span className="text-slate-400">未填(¥0)</span>}
                              </TableCell>
                              <TableCell className="text-right tabular-nums font-medium text-slate-900">{item.quantity}</TableCell>
                              <TableCell className="text-right tabular-nums text-blue-700 font-medium">{formatMoney(item.sales)}</TableCell>
                              <TableCell className="text-right tabular-nums text-slate-700">{formatMoney(item.totalCost)}</TableCell>
                              <TableCell className="text-right tabular-nums font-semibold text-emerald-700">{formatMoney(item.profit)}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                <span className={item.margin >= 30 ? "font-semibold text-emerald-700" : "text-slate-700"}>
                                  {item.margin.toFixed(1)}%
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="channels" className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden mt-0">
              <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border border-slate-200 shadow-none">
                <CardHeader className="px-4 py-2.5">
                  <CardTitle className="text-base">支付渠道交易与通道成本</CardTitle>
                  <p className="text-xs text-slate-500">{periodLabel}真实支付渠道会话与资金到账测算</p>
                </CardHeader>
                <CardContent className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-xs">
                          <TableHead>支付渠道</TableHead>
                          <TableHead className="text-center">成交笔数</TableHead>
                          <TableHead className="text-right">交易总额</TableHead>
                          <TableHead className="text-right">预估通道费 (~3%)</TableHead>
                          <TableHead className="text-right">净结算入账</TableHead>
                          <TableHead className="text-center">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {metrics.channelStats.map((ch) => (
                          <TableRow key={ch.code} className="text-xs">
                            <TableCell className="font-medium text-slate-900">{ch.label}</TableCell>
                            <TableCell className="text-center tabular-nums text-slate-700">{ch.count} 笔</TableCell>
                            <TableCell className="text-right tabular-nums font-semibold text-slate-900">{formatMoney(ch.amount)}</TableCell>
                            <TableCell className="text-right tabular-nums text-amber-700">{formatMoney(ch.fee)}</TableCell>
                            <TableCell className="text-right tabular-nums font-semibold text-emerald-700">{formatMoney(ch.net)}</TableCell>
                            <TableCell className="text-center">
                              <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                                <Link href="/admin/payments">对账明细</Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="recharge" className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden mt-0">
              <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border border-slate-200 shadow-none">
                <CardHeader className="px-4 py-2.5">
                  <CardTitle className="text-base">用户充值与资金沉淀</CardTitle>
                  <p className="text-xs text-slate-500">{periodLabel}用户余额账户充值与资金变动流向</p>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-0">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs text-slate-500">充值到账金额</div>
                      <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                        {formatMoney(metrics.rangeRechargeAmount)}
                      </div>
                      <div className="mt-2 text-xs text-slate-500">成功充值笔数：{metrics.paidRechargeCount} 笔</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs text-slate-500">资金对账服务</div>
                      <p className="mt-2 text-xs text-slate-600">系统自动比对回调日志与充值单据入账情况。</p>
                      <div className="mt-3">
                        <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                          <Link href="/admin/recharges">充值订单管理</Link>
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs text-slate-500">余额流水账本</div>
                      <p className="mt-2 text-xs text-slate-600">查询用户余额变动流水记录，核对账户扣减与增加。</p>
                      <div className="mt-3">
                        <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                          <Link href="/admin/balance-ledger">查看余额流水</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </AdminPageShell>
  );
}
