"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  ClipboardList,
  Loader,
  Package,
  RefreshCcw,
  TrendingUp,
  Users,
} from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminStatsCard from "@/components/admin/AdminStatsCard";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getOrderStatusLabel } from "@/lib/orders/order-status";
import type { OrderRecord } from "@/lib/orders/order-types";
import { listAdminOrders } from "@/lib/orders/order-queries";
import {
  getSupabaseBrowserClient,
  hasSupabaseConfig,
} from "@/lib/supabase/client";
import { listCategories, listProducts, type AdminCategory, type AdminProduct } from "@/lib/supabase/admin-catalog";

type DashboardState = {
  categories: AdminCategory[];
  products: AdminProduct[];
  recentOrders: OrderRecord[];
  orderCount: number;
  userCount: number | null;
  adminCount: number | null;
  categoriesFailed: boolean;
  productsFailed: boolean;
  ordersFailed: boolean;
  profilesFailed: boolean;
};

const initialDashboard: DashboardState = {
  categories: [],
  products: [],
  recentOrders: [],
  orderCount: 0,
  userCount: null,
  adminCount: null,
  categoriesFailed: false,
  productsFailed: false,
  ordersFailed: false,
  profilesFailed: false,
};

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardState>(initialDashboard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    if (!hasSupabaseConfig()) {
      setError("Supabase 未配置，暂时无法读取后台数据。");
      setLoading(false);
      return;
    }

    try {
      const supabase = getSupabaseBrowserClient();
      const [categoryResult, productResult, orderResult, profilesResult] = await Promise.allSettled([
        listCategories(),
        listProducts({ page: 1, pageSize: 100, sortBy: "updated_at" }),
        listAdminOrders(supabase, { page: 1, pageSize: 8 }),
        supabase.from("profiles").select("id,role", { count: "exact" }),
      ]);

      const categories = categoryResult.status === "fulfilled" ? categoryResult.value : [];
      const products = productResult.status === "fulfilled" ? productResult.value.products : [];
      const orders = orderResult.status === "fulfilled" ? orderResult.value.orders : [];
      const profileResponse = profilesResult.status === "fulfilled" ? profilesResult.value : null;
      const profileRows = (profileResponse?.data ?? []) as Array<{ role?: string | null }>;

      setData({
        categories,
        products,
        recentOrders: orders,
        orderCount: orderResult.status === "fulfilled" ? orderResult.value.count : 0,
        userCount: profilesResult.status === "fulfilled" ? profileResponse?.count ?? profileRows.length : null,
        adminCount: profilesResult.status === "fulfilled"
          ? profileRows.filter((row) => row.role === "admin").length
          : null,
        categoriesFailed: categoryResult.status === "rejected",
        productsFailed: productResult.status === "rejected",
        ordersFailed: orderResult.status === "rejected",
        profilesFailed: profilesResult.status === "rejected" || Boolean(profileResponse?.error),
      });
      setLastRefreshedAt(new Date().toLocaleString("zh-CN", { hour12: false }));
    } catch (dashboardError) {
      const message =
        (dashboardError as { message?: string } | null | undefined)?.message ??
        "控制台数据加载失败，请稍后重试。";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const todayOrders = useMemo(() => {
    if (data.ordersFailed) return null;
    const today = new Date().toDateString();
    return data.recentOrders.filter((order) => new Date(order.created_at).toDateString() === today).length;
  }, [data.ordersFailed, data.recentOrders]);

  const pendingOrders = data.ordersFailed
    ? null
    : data.recentOrders.filter((order) =>
        ["paid", "processing", "pending_payment"].includes(order.status)
      ).length;
  const activeProducts = data.productsFailed ? null : data.products.filter((product) => product.status === "active").length;
  const inactiveProducts = data.productsFailed ? null : data.products.filter((product) => product.status === "inactive").length;
  const soldOutProducts = data.productsFailed ? null : data.products.filter((product) => product.status === "sold_out").length;
  const lowStockProducts = data.products
    .filter((product) => Number(product.stock) > 0 && Number(product.stock) <= 5)
    .slice(0, 8);
  const levelOneCategories = data.categoriesFailed ? null : data.categories.filter((category) => category.level === 1).length;
  const childCategories = data.categoriesFailed ? null : data.categories.filter((category) => category.level > 1).length;

  const stats = [
    { label: "今日访问量", value: "未接入", icon: BarChart3 },
    { label: "本周访问量", value: "未接入", icon: TrendingUp },
    { label: "本月访问量", value: "未接入", icon: TrendingUp },
    { label: "今日订单", value: todayOrders ?? "-", icon: ClipboardList },
    { label: "待处理订单", value: pendingOrders ?? "-", icon: Loader },
    { label: "用户数量", value: data.profilesFailed ? "-" : data.userCount ?? "-", icon: Users },
    { label: "商品数量", value: data.productsFailed ? "-" : data.products.length, icon: Package },
  ];

  return (
    <AdminPageShell
      title="后台概览"
      description="查看订单、商品、用户和分类的基础运营状态。访问统计尚未接入时会明确标记。"
      actions={
        <Button variant="outline" size="sm" onClick={loadDashboard} disabled={loading}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          刷新
        </Button>
      }
    >
      {error ? (
        <AdminErrorState description={error} onRetry={loadDashboard} />
      ) : (
        <div className="flex min-h-0 w-full flex-1 flex-col gap-3 overflow-auto xl:overflow-hidden">
          <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 min-[1500px]:grid-cols-7">
            {stats.map((stat) => (
              <AdminStatsCard
                key={stat.label}
                title={stat.label}
                value={loading ? "..." : stat.value}
                icon={stat.icon}
                iconColor="text-blue-600"
                iconBg="bg-blue-50"
              />
            ))}
          </div>

          <div className="grid min-h-0 flex-[1.15] grid-cols-1 gap-3 overflow-visible xl:grid-cols-2 xl:overflow-hidden">
            <DashboardTableCard
              title="时间维度对比"
              loading={loading}
              headers={["时间", "访问量", "订单数", "成交额", "转化率"]}
              rows={[
                ["今日", "未接入", todayOrders === null ? "-" : String(todayOrders), "-", "未接入"],
                ["本周", "未接入", "-", "-", "未接入"],
                ["本月", "未接入", "-", "-", "未接入"],
              ]}
            />
            <Card className="flex min-h-0 flex-col overflow-hidden">
              <CardHeader className="flex h-[52px] shrink-0 justify-center px-4 py-0">
                <CardTitle className="text-base">商品点击与转化</CardTitle>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 overflow-auto px-4 pb-4 pt-0">
                {loading ? (
                  <AdminTableSkeleton rows={5} />
                ) : (
                  <AdminEmptyState
                    title="转化数据暂未接入"
                    description="接入商品曝光与点击事件后，将在此显示真实转化数据。"
                    className="min-h-full py-3"
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-visible xl:grid-cols-3 xl:overflow-hidden">
            <RecentOrdersCard loading={loading} orders={data.recentOrders} />
            <LowStockCard loading={loading} products={lowStockProducts} />
            <SystemOverviewCard
              activeProducts={activeProducts}
              inactiveProducts={inactiveProducts}
              soldOutProducts={soldOutProducts}
              levelOneCategories={levelOneCategories}
              childCategories={childCategories}
              userCount={data.userCount}
              adminCount={data.adminCount}
              lastRefreshedAt={lastRefreshedAt}
            />
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}

function DashboardTableCard({
  title,
  headers,
  rows,
  loading,
}: {
  title: string;
  headers: string[];
  rows: string[][];
  loading: boolean;
}) {
  return (
    <Card className="flex min-h-0 flex-col overflow-hidden">
      <CardHeader className="flex h-[52px] shrink-0 justify-center px-4 py-0">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto px-4 pb-4 pt-0">
        {loading ? (
          <AdminTableSkeleton rows={5} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {headers.map((header) => (
                  <TableHead key={header} className="h-9 whitespace-nowrap text-xs">
                    {header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row[0]}>
                  {row.map((cell, index) => (
                    <TableCell key={`${row[0]}-${index}`} className="whitespace-nowrap text-xs">
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function RecentOrdersCard({ loading, orders }: { loading: boolean; orders: OrderRecord[] }) {
  return (
    <Card className="flex min-h-0 flex-col overflow-hidden">
      <CardHeader className="flex h-[52px] shrink-0 justify-center px-4 py-0">
        <CardTitle className="text-base">最近订单</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto px-4 pb-4 pt-0">
        {loading ? (
          <AdminTableSkeleton rows={4} />
        ) : orders.length === 0 ? (
          <AdminEmptyState title="暂无订单" description="用户提交订单后会显示在这里。" className="min-h-full py-3" />
        ) : (
          <div className="space-y-2">
            {orders.slice(0, 6).map((order) => (
              <div key={order.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-900">{order.order_no}</div>
                  <div className="truncate text-slate-500">{order.customer_email || "未填写邮箱"}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-semibold text-primary">¥{Number(order.total_amount).toFixed(2)}</div>
                  <div className="text-slate-500">{getOrderStatusLabel(order.status)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LowStockCard({ loading, products }: { loading: boolean; products: AdminProduct[] }) {
  return (
    <Card className="flex min-h-0 flex-col overflow-hidden">
      <CardHeader className="flex h-[52px] shrink-0 justify-center px-4 py-0">
        <CardTitle className="text-base">低库存商品</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto px-4 pb-4 pt-0">
        {loading ? (
          <AdminTableSkeleton rows={4} />
        ) : products.length === 0 ? (
          <AdminEmptyState title="暂无低库存商品" description="当前商品库存状态正常。" className="min-h-full py-3" />
        ) : (
          <div className="space-y-2">
            {products.map((product) => (
              <div key={product.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-900">{product.name}</div>
                  <div className="truncate text-slate-500">{product.slug}</div>
                </div>
                <div className="shrink-0 font-semibold text-orange-600">{product.stock}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SystemOverviewCard({
  activeProducts,
  inactiveProducts,
  soldOutProducts,
  levelOneCategories,
  childCategories,
  userCount,
  adminCount,
  lastRefreshedAt,
}: {
  activeProducts: number | null;
  inactiveProducts: number | null;
  soldOutProducts: number | null;
  levelOneCategories: number | null;
  childCategories: number | null;
  userCount: number | null;
  adminCount: number | null;
  lastRefreshedAt: string | null;
}) {
  const rows = [
    ["已上架商品", activeProducts ?? "-"],
    ["已下架商品", inactiveProducts ?? "-"],
    ["售罄商品", soldOutProducts ?? "-"],
    ["一级分类", levelOneCategories ?? "-"],
    ["子分类", childCategories ?? "-"],
    ["普通用户", userCount === null || adminCount === null ? "-" : Math.max(userCount - adminCount, 0)],
    ["管理员", adminCount ?? "-"],
  ];

  return (
    <Card className="flex min-h-0 flex-col overflow-hidden">
      <CardHeader className="flex h-[52px] shrink-0 justify-center px-4 py-0">
        <CardTitle className="text-base">系统概况</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto px-3 pb-3 pt-0">
        <div className="grid grid-cols-2 gap-2 text-xs">
          {rows.map(([label, value]) => (
            <div key={label} className="flex min-h-[44px] items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
              <div className="truncate text-slate-500">{label}</div>
              <div className="shrink-0 text-sm font-semibold text-slate-900">{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-2 truncate text-xs text-slate-400">
          最近刷新：{lastRefreshedAt ?? "-"}
        </div>
      </CardContent>
    </Card>
  );
}
