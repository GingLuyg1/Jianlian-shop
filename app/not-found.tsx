import Link from "next/link";
import { AlertCircle, Home, PackageSearch } from "lucide-react";

import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
  return (
    <PublicLayout>
      <Card className="mx-auto max-w-2xl border-orange-100">
        <CardContent className="px-6 py-14 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-primary">
            <AlertCircle className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-2xl font-black text-slate-950">
            页面不存在或商品已下架
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            你访问的页面可能已移动、删除，或商品当前不可展示。请返回首页或继续浏览商品分类。
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link href="/">
                <Home className="mr-2 h-4 w-4" />
                返回首页
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/products/digital-accounts">
                <PackageSearch className="mr-2 h-4 w-4" />
                浏览商品
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </PublicLayout>
  );
}
