import AccountRechargeContent from "@/components/account/AccountRechargeContent";
import { productCategoryMetadata } from "@/lib/product-category-metadata";

export const metadata = productCategoryMetadata({
  title: "账户充值",
  description: "Jianlian Shop 账户余额充值入口和可用支付渠道说明。",
  path: "/products/account-recharge",
});

export default function AccountRechargePage() {
  return <AccountRechargeContent />;
}
