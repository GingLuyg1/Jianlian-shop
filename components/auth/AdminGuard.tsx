"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getCurrentProfile,
  getSupabaseBrowserClient,
  hasSupabaseConfig,
  UserProfile,
} from "@/lib/supabase/client";

type GuardState =
  | { status: "loading" }
  | { status: "missing-config" }
  | { status: "forbidden"; profile: UserProfile | null }
  | { status: "allowed"; profile: UserProfile };

export default function AdminGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<GuardState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    async function checkAdminAccess() {
      if (!hasSupabaseConfig()) {
        setState({ status: "missing-config" });
        return;
      }

      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
          return;
        }

        const profile = await getCurrentProfile();
        if (!active) return;

        if (profile?.role === "admin") {
          setState({ status: "allowed", profile });
        } else {
          setState({ status: "forbidden", profile });
        }
      } catch {
        if (active) setState({ status: "forbidden", profile: null });
      }
    }

    checkAdminAccess();

    return () => {
      active = false;
    };
  }, [pathname, router]);

  if (state.status === "allowed") {
    return <>{children}</>;
  }

  if (state.status === "missing-config") {
    return (
      <AdminAccessMessage
        icon={<ShieldAlert className="h-6 w-6" />}
        title="Supabase 尚未配置"
        description="正式后台账号需要先配置 Supabase 项目地址和匿名公钥。配置完成后，后台会按 profiles.role 校验管理员权限。"
        actionLabel="返回首页"
        actionHref="/"
      />
    );
  }

  if (state.status === "forbidden") {
    return (
      <AdminAccessMessage
        icon={<ShieldAlert className="h-6 w-6" />}
        title="无后台访问权限"
        description="当前账号不是管理员。请在 Supabase 的 profiles 表中把该账号 role 设置为 admin。"
        actionLabel="返回首页"
        actionHref="/"
      />
    );
  }

  return (
    <AdminAccessMessage
      icon={<ShieldCheck className="h-6 w-6" />}
      title="正在校验后台权限"
      description="正在检查当前账号登录状态和管理员角色。"
    />
  );
}

function AdminAccessMessage({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-border">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {icon}
        </div>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
        {actionLabel && actionHref ? (
          <Button className="mt-6" asChild>
            <Link href={actionHref}>{actionLabel}</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
