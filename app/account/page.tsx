import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, Mail, ShieldCheck, Wallet } from "lucide-react";

import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getSupabaseServerClient,
  hasSupabaseServerConfig,
} from "@/lib/supabase/server";
import { getOrCreateProfile } from "@/lib/supabase/profiles";

export default async function AccountPage() {
  if (!hasSupabaseServerConfig()) {
    redirect("/login?redirect=/account");
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/account");
  }

  const profile = await getOrCreateProfile(supabase, user);

  return (
    <PublicLayout contentClassName="max-w-none overflow-hidden px-4 py-3 md:px-6">
      <div className="mx-auto grid h-[calc(100dvh-87px)] max-w-[1500px] gap-4 overflow-hidden">
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader className="shrink-0 pb-3">
            <CardTitle className="text-xl">账户中心</CardTitle>
            <p className="text-sm text-muted-foreground">
              当前账号信息来自 Supabase Auth 和 profiles 表。
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Mail className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm text-muted-foreground">登录邮箱</div>
                  <div className="truncate font-semibold">
                    {profile.email || user.email || "未设置邮箱"}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-sm text-muted-foreground">角色</div>
                  <div className="font-semibold">{profile.role}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-600">
                  <Wallet className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-sm text-muted-foreground">账户余额</div>
                  <div className="font-semibold">
                    ¥{profile.balance.toFixed(2)}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ClipboardList className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-sm text-muted-foreground">我的订单</div>
                  <Button variant="link" className="h-auto p-0" asChild>
                    <Link href="/account/orders">进入订单页</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}
