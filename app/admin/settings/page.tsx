"use client";

import AdminLayout from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export default function AdminSettingsPage() {
  return (
    <AdminLayout>
      <h1 className="text-xl font-bold text-foreground mb-4">系统设置</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">商城基础信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">站点名称</div>
              <Input value="Jianlian 简联" readOnly className="h-9" />
            </div>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">顶部公告</div>
              <Textarea
                value="平台订单均为 mock 演示数据，真实支付和自动发货将在后续版本接入。"
                readOnly
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">前台下单入口</div>
                <div className="text-xs text-muted-foreground mt-1">
                  第一版允许用户提交 mock 订单
                </div>
              </div>
              <Switch checked disabled />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">后续接入状态</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              ["Supabase 数据库", "第二阶段接入"],
              ["真实登录鉴权", "第二阶段接入"],
              ["支付宝 / 微信支付", "第三阶段接入"],
              ["订单状态自动更新", "第三阶段接入"],
            ].map(([name, status]) => (
              <div
                key={name}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <span className="text-sm">{name}</span>
                <Badge variant="outline" className="text-[10px]">
                  {status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
