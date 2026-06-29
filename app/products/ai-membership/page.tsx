import AiMembershipMallContent from "@/components/products/AiMembershipMallContent";
import { productCategoryMetadata } from "@/lib/product-category-metadata";

export const metadata = productCategoryMetadata({
  title: "AI 会员充值",
  description: "ChatGPT、Claude、Gemini、Grok 等 AI 会员与相关数字服务。",
  path: "/products/ai-membership",
});

export default function AiMembershipPage() {
  return <AiMembershipMallContent />;
}
