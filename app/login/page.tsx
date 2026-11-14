import { Suspense } from "react";
import AuthScreen from "@/components/auth/AuthScreen";

export default function LoginPage() {
  return (
    <Suspense fallback={<div role="status" className="px-5 py-8 text-center text-sm text-muted-foreground">登录页面加载中...</div>}>
      <AuthScreen mode="login" />
    </Suspense>
  );
}
