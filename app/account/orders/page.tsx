import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";

import PublicLayout from "@/components/layout/PublicLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getSupabaseServerClient,
  hasSupabaseServerConfig,
} from "@/lib/supabase/server";

export default async function MyOrdersPage() {
  if (!hasSupabaseServerConfig()) {
    redirect("/login?redirect=/account/orders");
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/account/orders");
  }

  return (
    <PublicLayout contentClassName="max-w-none overflow-hidden px-4 py-3 md:px-6">
      <div className="mx-auto grid h-[calc(100dvh-87px)] max-w-[1500px] gap-4 overflow-hidden">
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader className="shrink-0 pb-3">
            <CardTitle className="text-xl">我的订单</CardTitle>
            <p className="text-sm text-muted-foreground">
              已登录账号：{user.email || "未设置邮箱"}
            </p>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 items-center justify-center">
            <div className="max-w-md rounded-2xl border border-dashed border-orange-200 bg-orange-50/60 p-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-primary shadow-sm">
                <ClipboardList className="h-7 w-7" />
              </div>
              <h2 className="mt-5 text-xl font-semibold">订单功能开发中</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                当前仅接入真实登录注册。订单数据库、支付和真实订单查询暂未接入。
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}
