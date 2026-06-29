import DigitalAccountsMallContent from "@/components/products/DigitalAccountsMallContent";
import { productCategoryMetadata } from "@/lib/product-category-metadata";

export const metadata = productCategoryMetadata({
  title: "数字账号",
  description: "Apple ID、Steam、Gmail、Outlook、Telegram 等数字账号商品。",
  path: "/products/digital-accounts",
});

export default function DigitalAccountsPage() {
  return <DigitalAccountsMallContent />;
}
