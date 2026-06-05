"use client";

import AdminLayout from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const payments = [
  {
    id: "PAY-20260605001",
    orderNo: "JL1717509800123",
    method: "余额支付",
    amount: 128,
    status: "已支付",
    createdAt: "2026-06-05 00:18",
  },
  {
    id: "PAY-20260604008",
    orderNo: "JL1717505328451",
    method: "支付宝",
    amount: 368,
    status: "待确认",
    createdAt: "2026-06-04 22:48",
  },
  {
    id: "PAY-20260604007",
    orderNo: "JL1717499241390",
    method: "微信支付",
    amount: 98,
    status: "已支付",
    createdAt: "2026-06-04 21:07",
  },
  {
    id: "PAY-20260603012",
    orderNo: "JL1717415811096",
    method: "银行卡转账",
    amount: 650,
    status: "已退款",
    createdAt: "2026-06-03 19:42",
  },
];

const statusColorMap: Record<string, string> = {
  已支付: "bg-green-50 text-green-700 border-green-200",
  待确认: "bg-amber-50 text-amber-700 border-amber-200",
  已退款: "bg-slate-50 text-slate-600 border-slate-200",
};

export default function AdminPaymentsPage() {
  return (
    <AdminLayout>
      <h1 className="text-xl font-bold text-foreground mb-4">支付记录</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">今日收款</div>
            <div className="text-2xl font-semibold mt-1">¥4,286.00</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">待确认支付</div>
            <div className="text-2xl font-semibold mt-1">6</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">退款记录</div>
            <div className="text-2xl font-semibold mt-1">2</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">支付记录列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">支付流水</TableHead>
                  <TableHead className="text-xs">订单号</TableHead>
                  <TableHead className="text-xs">支付方式</TableHead>
                  <TableHead className="text-xs">金额</TableHead>
                  <TableHead className="text-xs">状态</TableHead>
                  <TableHead className="text-xs">创建时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="text-xs font-medium">
                      {payment.id}
                    </TableCell>
                    <TableCell className="text-xs">{payment.orderNo}</TableCell>
                    <TableCell className="text-xs">{payment.method}</TableCell>
                    <TableCell className="text-xs">
                      ¥{payment.amount.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          statusColorMap[payment.status] || ""
                        )}
                      >
                        {payment.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{payment.createdAt}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
