"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getSupabaseBrowserClient,
  hasSupabaseConfig,
} from "@/lib/supabase/client";

const ADMIN_EMAIL = "gac000189@gmail.com";
const ADMIN_CHECK_TIMEOUT_MS = 8000;

type AdminProfile = {
  role: string | null;
};

type GuardState =
  | { status: "loading" }
  | { status: "missing-config" }
  | { status: "auth-error"; message: string }
  | { status: "forbidden"; profile: AdminProfile | null }
  | { status: "allowed"; profile: AdminProfile };

function withTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} 请求超时，请检查网络或 Supabase 配置。`));
    }, ADMIN_CHECK_TIMEOUT_MS);

    Promise.resolve(promise)
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timer));
  });
}

export default function AdminGuard({
  children,
  loadingFallback,
}: {
  children: ReactNode;
  loadingFallback?: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const initialPathRef = useRef(pathname);
  const [state, setState] = useState<GuardState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    async function checkAdminAccess() {
      if (!hasSupabaseConfig()) {
        if (active) setState({ status: "missing-config" });
        return;
      }

      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
        } = await withTimeout(supabase.auth.getUser(), "登录状态校验");

        if (!user) {
          router.replace(
            `/login?redirect=${encodeURIComponent(initialPathRef.current)}`
          );
          return;
        }

        const normalizedEmail = user.email?.toLowerCase() ?? "";
        const isConfiguredAdmin = normalizedEmail === ADMIN_EMAIL;

        const { data: profile, error: profileError } = await withTimeout(
          supabase.from("profiles").select("role").eq("id", user.id).single(),
          "管理员资料查询"
        );

        if (profile?.role === "admin") {
          if (active) setState({ status: "allowed", profile });
          return;
        }

        if (isConfiguredAdmin) {
          const { data: adminProfile, error: upsertError } = await withTimeout(
            supabase
              .from("profiles")
              .upsert(
                {
                  id: user.id,
                  email: normalizedEmail,
                  role: "admin",
                  balance: 0,
                },
                { onConflict: "id" }
              )
              .select("role")
              .single(),
            "管理员资料同步"
          );

          if (!upsertError && adminProfile?.role === "admin") {
            if (active) setState({ status: "allowed", profile: adminProfile });
            return;
          }

          console.error("[AdminGuard] Failed to ensure admin profile", {
            profileError,
            upsertError,
          });
        } else if (profileError) {
          console.error("[AdminGuard] Failed to load profile role", profileError);
        }

        if (active) {
          setState({ status: "forbidden", profile: profile ?? null });
        }
      } catch (error) {
        console.error("[AdminGuard] Admin access check failed", error);
        if (!active) return;

        const message =
          (error as { message?: string } | null | undefined)?.message ??
          "无法验证后台权限，请重新登录。";

        setState({ status: "auth-error", message });
      }
    }

    checkAdminAccess();

    return () => {
      active = false;
    };
  }, [router]);

  if (state.status === "allowed") {
    return <>{children}</>;
  }

  if (state.status === "loading") {
    return loadingFallback ?? <AdminLoadingMessage />;
  }

  if (state.status === "missing-config") {
    return (
      <AdminAccessMessage
        title="Supabase 尚未配置"
        description="正式后台账号需要先配置 Supabase 项目地址和匿名公钥。配置完成后，后台会按 profiles.role 校验管理员权限。"
      />
    );
  }

  if (state.status === "forbidden") {
    return (
      <AdminAccessMessage
        title="无后台访问权限"
        description="当前账号不是管理员。请确认 Supabase profiles 表中该账号的 role 已设置为 admin。"
      />
    );
  }

  return (
    <AdminAccessMessage
      title="后台权限校验失败"
      description={state.message}
    />
  );
}

function AdminLoadingMessage() {
  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="h-12 rounded-xl bg-white shadow-sm" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-xl bg-white shadow-sm"
            />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-xl bg-white shadow-sm" />
      </div>
    </div>
  );
}

function AdminAccessMessage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-slate-950">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">{description}</p>
        <Button className="mt-6" asChild>
          <Link href="/">返回首页</Link>
        </Button>
      </div>
    </div>
  );
}
