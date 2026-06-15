"use client";

import AdminLayout from "@/components/admin/AdminLayout";
import AdminStatsCard from "@/components/admin/AdminStatsCard";
import {
  BarChart3,
  ClipboardList,
  Loader,
  Package,
  TrendingUp,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const visitStats = [
  { label: "今日访问量", value: 0, icon: BarChart3 },
  { label: "本周访问量", value: 0, icon: TrendingUp },
  { label: "本月访问量", value: 0, icon: TrendingUp },
  { label: "今日订单", value: 0, icon: ClipboardList },
  { label: "待处理订单", value: 0, icon: Loader },
  { label: "用户数量", value: 0, icon: Users },
  { label: "商品数量", value: 0, icon: Package },
];

const timeComparisonRows = [
  ["今日", "0", "0", "0", "0.00%"],
  ["昨日", "0", "0", "0", "0.00%"],
  ["本周", "0", "0", "0", "0.00%"],
  ["上周", "0", "0", "0", "0.00%"],
  ["本月", "0", "0", "0", "0.00%"],
];

const productMetricRows = [
  ["Apple ID", "0", "0", "0.00%", "0.00%"],
  ["Steam 账号", "0", "0", "0.00%", "0.00%"],
  ["ChatGPT Plus", "0", "0", "0.00%", "0.00%"],
  ["Grok Super", "0", "0", "0.00%", "0.00%"],
  ["接码服务", "0", "0", "0.00%", "0.00%"],
];

export default function AdminDashboardPage() {
  return (
    <AdminLayout>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-foreground">后台概览</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          当前为管理员数据面板基础版，真实订单和支付流程后续接入。
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {visitStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <AdminStatsCard
              key={stat.label}
              title={stat.label}
              value={stat.value}
              icon={Icon}
              iconColor="text-blue-600"
              iconBg="bg-blue-50"
            />
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">时间维度对比</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">时间</TableHead>
                  <TableHead className="text-xs">访问量</TableHead>
                  <TableHead className="text-xs">订单数</TableHead>
                  <TableHead className="text-xs">成交额</TableHead>
                  <TableHead className="text-xs">转化率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timeComparisonRows.map((row) => (
                  <TableRow key={row[0]}>
                    {row.map((cell, index) => (
                      <TableCell key={`${row[0]}-${index}`} className="text-xs">
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">商品点击与转化占位</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">商品</TableHead>
                  <TableHead className="text-xs">曝光</TableHead>
                  <TableHead className="text-xs">点击</TableHead>
                  <TableHead className="text-xs">点击率</TableHead>
                  <TableHead className="text-xs">转化率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productMetricRows.map((row) => (
                  <TableRow key={row[0]}>
                    {row.map((cell, index) => (
                      <TableCell key={`${row[0]}-${index}`} className="text-xs">
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
