import Link from "next/link";
import { Button } from "@/components/ui/button";
import RechargeEmptyState from "./RechargeEmptyState";

export default function RecordLoginState({ variant = "recharge" }: { variant?: "recharge" | "balance" }) {
  return <RechargeEmptyState variant={variant} title={`登录后查看${variant === "balance" ? "资金变动记录" : "充值记录"}`} actions={
    <Button asChild size="sm" className="rounded-xl px-6"><Link href="/login?redirect=/products/account-recharge">登录</Link></Button>
  } />;
}
