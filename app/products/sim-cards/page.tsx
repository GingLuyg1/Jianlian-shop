import SimCardsMallContent from "@/components/products/SimCardsMallContent";
import { productCategoryMetadata } from "@/lib/product-category-metadata";

export const metadata = productCategoryMetadata({
  title: "国际电话卡",
  description: "海外实体电话卡、通信套餐和国际通信相关服务。",
  path: "/products/sim-cards",
});

export default function SimCardsPage() {
  return <SimCardsMallContent />;
}
