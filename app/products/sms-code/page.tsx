import SmsCodeMallContent from "@/components/products/SmsCodeMallContent";
import { productCategoryMetadata } from "@/lib/product-category-metadata";

export const metadata = productCategoryMetadata({
  title: "接码服务",
  description: "注册验证、平台接码和短信验证码相关数字服务。",
  path: "/products/sms-code",
});

export default function SmsCodePage() {
  return <SmsCodeMallContent />;
}
