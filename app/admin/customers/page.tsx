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

const customers = [
  {
    id: "CUS-1001",
    contact: "li***@gmail.com",
    segment: "注册用户",
    balance: 286.5,
    orders: 8,
    lastOrder: "2026-06-04 21:18",
    status: "活跃",
  },
  {
    id: "CUS-1002",
    contact: "+86 138****1024",
    segment: "游客下单",
    balance: 0,
    orders: 2,
    lastOrder: "2026-06-04 18:42",
    status: "待跟进",
  },
  {
    id: "CUS-1003",
    contact: "telegram: @chen***",
    segment: "企业客户",
    balance: 1280,
    orders: 19,
    lastOrder: "2026-06-03 16:05",
    status: "活跃",
  },
  {
    id: "CUS-1004",
    contact: "wang***@outlook.com",
    segment: "注册用户",
    balance: 58,
    orders: 4,
    lastOrder: "2026-06-02 11:30",
    status: "沉默",
  },
];

export default function AdminCustomersPage() {
  return (
    <AdminLayout>
      <h1 className="text-xl font-bold text-foreground mb-4">客户信息</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">客户总数</div>
            <div className="text-2xl font-semibold mt-1">1,286</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">有余额客户</div>
            <div className="text-2xl font-semibold mt-1">342</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">今日新增</div>
            <div className="text-2xl font-semibold mt-1">18</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">客户列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">客户编号</TableHead>
                  <TableHead className="text-xs">联系方式</TableHead>
                  <TableHead className="text-xs">类型</TableHead>
                  <TableHead className="text-xs">余额</TableHead>
                  <TableHead className="text-xs">订单数</TableHead>
                  <TableHead className="text-xs">最近下单</TableHead>
                  <TableHead className="text-xs">状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className="text-xs font-medium">
                      {customer.id}
                    </TableCell>
                    <TableCell className="text-xs">{customer.contact}</TableCell>
                    <TableCell className="text-xs">{customer.segment}</TableCell>
                    <TableCell className="text-xs">
                      ¥{customer.balance.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-xs">{customer.orders}</TableCell>
                    <TableCell className="text-xs">{customer.lastOrder}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {customer.status}
                      </Badge>
                    </TableCell>
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
