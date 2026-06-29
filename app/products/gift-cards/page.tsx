import GiftCardsMallContent from "@/components/products/GiftCardsMallContent";
import { productCategoryMetadata } from "@/lib/product-category-metadata";

export const metadata = productCategoryMetadata({
  title: "礼品卡与充值卡",
  description: "Apple Gift Card、App Store 礼品卡及常用充值卡商品。",
  path: "/products/gift-cards",
});

export default function GiftCardsPage() {
  return <GiftCardsMallContent />;
}
