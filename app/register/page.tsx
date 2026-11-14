import { Suspense } from "react";
import AuthScreen from "@/components/auth/AuthScreen";

export default function RegisterPage() {
  return (
    <Suspense fallback={<div role="status" className="px-5 py-8 text-center text-sm text-muted-foreground">注册页面加载中...</div>}>
      <AuthScreen mode="register" />
    </Suspense>
  );
}
