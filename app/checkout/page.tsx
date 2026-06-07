"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CreditCard,
  Gift,
  Minus,
  Plus,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { products } from "@/lib/mock-data";
import { Order, Product } from "@/lib/types";
import { cn } from "@/lib/utils";

const PRICE_LABELS: Record<string, string> = {
  "gift-apple-us": "¥14.84-¥742.00",
  "gift-giffgaff-topup": "¥107.80-¥215.60",
};

type SkuOption = {
  id: string;
  label: string;
  rmb: number;
};

const SKU_OPTIONS_BY_PRODUCT_ID: Record<string, SkuOption[]> = {
  "gift-apple-us": [2, 3, 4, 5, 10, 15, 20, 25, 50, 100].map((usd) => ({
    id: `${usd}-usd`,
    label: `${usd} USD`,
    rmb: usd * 7 * 1.06,
  })),
  "gift-giffgaff-topup": [
    { id: "10-gbp", label: "10英镑", rmb: 14 * 7 * 1.1 },
    { id: "15-gbp", label: "15英镑", rmb: 21 * 7 * 1.1 },
    { id: "20-gbp", label: "20英镑", rmb: 28 * 7 * 1.1 },
  ],
};

export default function CheckoutPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const productId = searchParams.get("product") || "gift-apple-tr-500";
  const product = products.find((item) => item.id === productId);

  const [email, setEmail] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [confirmed, setConfirmed] = useState(true);
  const [termsOpen, setTermsOpen] = useState(false);
  const [selectedSkuId, setSelectedSkuId] = useState("");

  const skuOptions = product ? SKU_OPTIONS_BY_PRODUCT_ID[product.id] ?? [] : [];
  const selectedSku =
    skuOptions.find((sku) => sku.id === selectedSkuId) ?? skuOptions[0];
  const hasSku = skuOptions.length > 0;
  const unitPrice = product ? (hasSku ? selectedSku.rmb : product.price) : 0;
  const priceLabel = product ? getPriceLabel(product, selectedSku) : "";
  const amountLabel = useMemo(() => {
    if (!product) return "";
    return `¥${(unitPrice * quantity).toFixed(2)}`;
  }, [product, quantity, unitPrice]);

  if (!product) {
    return (
      <PublicLayout contentClassName="max-w-none px-4 md:px-6 py-5">
        <Card>
          <CardContent className="py-20 text-center">
            <h2 className="text-lg font-semibold">商品未找到</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              请返回商品页重新选择。
            </p>
          </CardContent>
        </Card>
      </PublicLayout>
    );
  }

  const handleSubmit = () => {
    const orderNo = `JL${Date.now()}`;
    const mockOrder: Order = {
      id: orderNo,
      orderNo,
      productName: product.name,
      productId: product.id,
      amount: unitPrice * quantity,
      paymentStatus: "pending",
      paymentStatusLabel: "待付款",
      processingStatus: "processing",
      processingStatusLabel: "处理中",
      createdAt: new Date().toLocaleString("zh-CN", { hour12: false }),
      contactInfo: email,
      shippingInfo: hasSku
        ? `SKU：${selectedSku.label}；数量：${quantity}`
        : `数量：${quantity}`,
      productType: product.productType,
    };

    try {
      const storageKey = "jianlian_mock_orders";
      const existing = JSON.parse(localStorage.getItem(storageKey) || "[]");
      const nextOrders = Array.isArray(existing)
        ? [mockOrder, ...existing].slice(0, 20)
        : [mockOrder];
      localStorage.setItem(storageKey, JSON.stringify(nextOrders));
    } catch {
      // Mock-only checkout; ignore local storage failures.
    }

    router.push(
      `/order-success?orderNo=${orderNo}&product=${encodeURIComponent(product.name)}&amount=${unitPrice * quantity}`
    );
  };

  return (
    <PublicLayout contentClassName="h-[calc(100dvh-87px)] max-w-none overflow-hidden px-4 py-3 md:px-6">
      <div className="grid h-full min-h-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
        <ProductDetailCard
          product={product}
          priceLabel={priceLabel}
          closeHref={getProductListHref(product)}
        />

        <Card className="h-full min-h-0 overflow-hidden">
          <CardContent className="flex h-full min-h-0 flex-col p-0">
            <div className="shrink-0 border-b border-border bg-white p-4">
              <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-bold">商品购买</h2>
              <Button className="h-9 rounded-full px-4 text-sm">商品使用教程</Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-5">
              {hasSku ? (
                <SkuSelector
                  options={skuOptions}
                  selectedSkuId={selectedSku.id}
                  onSelectSku={setSelectedSkuId}
                />
              ) : null}

                <div className="space-y-3 pt-2">
                  <h3 className="text-base font-semibold">购买提醒</h3>
                  <ReminderItem text="所有账号/卡密类商品请仔细核对说明，非商品问题不支持退换。" />
                  <ReminderItem text="售后期通常为商品发货后24小时内，请收到后第一时间检查。" />
                  <ReminderItem text="本站不提供违法用途教程，不为任何非法行业提供支持。" />
                  <ReminderItem text="如果不确定商品是否适合，请先联系在线客服确认。" />
                </div>
              </div>
            </div>

            <div className="shrink-0 space-y-3 border-t border-border bg-white p-4 shadow-[0_-10px_24px_rgba(15,23,42,0.04)]">
              <div>
                <label className="mb-1.5 block text-xs font-medium">
                  <span className="text-red-500">*</span>联系邮箱
                </label>
                <Input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="请输入接收卡密的邮箱"
                  className="h-10 bg-slate-50 text-sm"
                />
              </div>

              <div>
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                  支付方式
                </div>
                <div className="flex h-9 items-center gap-2 rounded-lg bg-slate-50 px-3 text-xs">
                  <Wallet className="h-4 w-4 text-primary" />
                  <span>余额支付</span>
                  <span className="text-primary">（¥0.00）</span>
                </div>
              </div>

              <div className="border-t border-border pt-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex h-10 items-center rounded-lg border border-border bg-white">
                    <button
                      type="button"
                      className="flex h-10 w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                      onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <div className="w-10 text-center text-sm font-semibold">
                      {quantity}
                    </div>
                    <button
                      type="button"
                      className="flex h-10 w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                      onClick={() => setQuantity((value) => value + 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  <Button
                    className="h-11 rounded-full px-7 text-sm"
                    onClick={handleSubmit}
                    disabled={!confirmed}
                  >
                    提交订单
                    <span className="mx-3 h-4 w-px bg-white/50" />
                    {amountLabel}
                  </Button>
                </div>
              </div>

              <div className="flex items-start gap-2 border-t border-border pt-3 text-xs">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span>
                  我确认已填写订单信息并了解
                  <button
                    type="button"
                    className="font-medium text-primary underline-offset-4 transition-colors hover:text-primary/80 hover:underline"
                    onClick={() => setTermsOpen(true)}
                  >
                    下单须知
                  </button>
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <TermsDialog open={termsOpen} onOpenChange={setTermsOpen} />
    </PublicLayout>
  );
}

function TermsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border bg-slate-50 px-6 py-5 text-left">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-base">
              ⚠️
            </span>
            网站使用条款
          </DialogTitle>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Jianlian 服务条款和免责声明，请您购买服务前详细阅读，确认下单购买即是接受本合约。
          </p>
        </DialogHeader>

        <div className="max-h-[calc(86vh-120px)] space-y-5 overflow-y-auto px-6 py-5 text-sm leading-7">
          <section className="rounded-xl border border-border bg-white p-4">
            <h3 className="mb-2 font-semibold text-foreground">合约说明</h3>
            <p className="text-muted-foreground">
              用户在使用 Jianlian 的服务或产品的过程中，与 Jianlian 发生的争议，依本“服务合约”解决。
            </p>
          </section>

          <section className="rounded-xl border border-border bg-white p-4">
            <h3 className="mb-2 font-semibold text-foreground">
              O、无管理及无技术支援服务
            </h3>
            <p className="text-muted-foreground">
              Jianlian 只提供运行平台且确保运行平台的稳定性，客户所提供的内容本身不在本平台存储及维护，本网站不提供包括内容管理、内容策划、内容运维等服务，请在购买我们的业务时确保自身内容符合相关平台规则规范。
            </p>
          </section>

          <section className="rounded-xl border border-border bg-white p-4">
            <h3 className="mb-3 font-semibold text-foreground">
              一、客户承诺不进行如下活动
            </h3>
            <ol className="space-y-2 text-muted-foreground">
              <li>
                01、包括但不限于政治、宗教、色情、侵权、仿牌、欺诈、钓鱼、木马病毒、买卖违禁品、博彩、垃圾邮件、有损社会秩序道德等，以及触犯中国地区和所在地政策法律禁止的内容。
              </li>
              <li>
                02、其它没有明确说明和声明，但实际性质是违法或非法的活动。
              </li>
            </ol>
          </section>

          <section className="rounded-xl border border-border bg-white p-4">
            <h3 className="mb-2 font-semibold text-foreground">二、滥用处理方案</h3>
            <p className="text-muted-foreground">
              违反“一、客户承诺不进行如下活动”相关规定，Jianlian 可不经同意先封禁客户账户及订单。
            </p>
          </section>

          <section className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <h3 className="mb-2 font-semibold text-primary">最终声明</h3>
            <div className="space-y-2 text-muted-foreground">
              <p>
                Jianlian 享有本合约最终解释权，若不接受或不认同，请不要选购。
              </p>
              <p>
                Jianlian 为全球社交营销平台，公司位于香港，本站仅用于全球社交媒体营销，不提供任何中国地区社交媒体服务！如有问题可尝试联系在线客服或提交工单，我们将尽快回复。
              </p>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProductDetailCard({
  product,
  priceLabel,
  closeHref,
}: {
  product: Product;
  priceLabel: string;
  closeHref: string;
}) {
  return (
    <Card className="relative h-full min-h-0 overflow-hidden">
      <button
        type="button"
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white text-muted-foreground shadow-sm transition-all hover:scale-105 hover:bg-muted hover:text-foreground"
        onClick={() => {
          window.location.href = closeHref;
        }}
        aria-label="关闭下单页面"
      >
        <X className="h-4 w-4" />
      </button>
      <CardContent className="h-full overflow-y-auto p-6">
        <div className="mb-5 text-sm font-medium text-muted-foreground">
          {product.categoryLabel}
        </div>

        <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="flex min-h-[210px] items-center justify-center rounded-xl bg-slate-50">
            <ProductArtwork product={product} />
          </div>

          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{product.name}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {product.description}
            </p>

            <div className="mt-8 grid max-w-2xl grid-cols-1 gap-4 rounded-xl border border-border bg-white p-5 sm:grid-cols-2">
              <DetailMetric label="商品分类" value={product.categoryLabel} />
              <DetailMetric label="商品单价" value={priceLabel} highlight />
              <DetailMetric label="商品库存" value="0" success />
              <DetailMetric label="商品发货方式" value={product.deliveryLabel} />
            </div>
          </div>
        </div>

        <div className="mt-8 max-w-3xl">
          <h2 className="mb-3 text-base font-semibold">商品详情</h2>
          <p className="text-sm leading-7 text-muted-foreground">
            {product.detail || product.description}
          </p>
          <div className="mt-4 space-y-2 text-sm font-medium text-red-500">
            <p>请仔细阅读商品说明后再下单。</p>
            <p>卡密/账号/兑换类商品属于一次性商品，售出后不支持无理由退换。</p>
            <p>商品当前库存显示为 0 时，仅展示价格和套餐信息，暂不可购买。</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SkuSelector({
  options,
  selectedSkuId,
  onSelectSku,
}: {
  options: SkuOption[];
  selectedSkuId: string;
  onSelectSku: (skuId: string) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5">
        {options.map((sku) => {
          const selected = selectedSkuId === sku.id;

          return (
            <button
              type="button"
              key={sku.id}
              onClick={() => onSelectSku(sku.id)}
              className={cn(
                "min-w-0 rounded-lg border bg-white px-3 py-3 text-center transition-all duration-150 hover:scale-[1.015] hover:shadow-sm",
                selected
                  ? "scale-[1.015] border-primary bg-primary/5 shadow-sm"
                  : "border-border hover:border-primary/30"
              )}
            >
              <div className="truncate text-base font-bold text-foreground">
                {sku.label}
              </div>
              <div className="mt-1 break-words text-[13px] font-semibold leading-tight text-primary">
                ¥{sku.rmb.toFixed(2)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProductArtwork({ product }: { product: Product }) {
  const imageSrc = getProductImage(product);

  if (imageSrc) {
    return (
      <img
        src={imageSrc}
        alt={product.name}
        className="h-40 w-40 rounded-2xl object-cover shadow-sm"
      />
    );
  }

  const Icon = product.category === "gift-cards" ? Gift : CreditCard;
  return (
    <div className="flex h-40 w-40 items-center justify-center rounded-2xl bg-primary/10">
      <Icon className="h-16 w-16 text-primary" />
    </div>
  );
}

function DetailMetric({
  label,
  value,
  highlight,
  success,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  success?: boolean;
}) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div
        className={[
          "mt-2 text-sm font-semibold",
          highlight ? "text-primary" : "",
          success ? "text-green-600" : "",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}

function ReminderItem({ text }: { text: string }) {
  return (
    <div className="flex gap-2 text-sm leading-6">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span>{text}</span>
    </div>
  );
}

function getProductImage(product: Product) {
  const name = product.name.toLowerCase();
  if (name.includes("giffgaff")) return "/assets/giffgaff-icon.svg";
  if (product.category === "gift-cards") return "/assets/apple-gift-card-icon.jpg";
  if (name.includes("ultra")) return "/assets/ultra-mobile-icon.svg";
  return null;
}

function getPriceLabel(product: Product, selectedSku?: SkuOption) {
  if (selectedSku) {
    return `¥${selectedSku.rmb.toFixed(2)}`;
  }

  return PRICE_LABELS[product.id] ?? `¥${product.price.toFixed(2)}`;
}

function getProductListHref(product: Product) {
  if (product.category === "gift-cards") {
    const category = product.id === "gift-giffgaff-topup" ? "giffgaff" : "apple";
    return `/products/gift-cards?category=${category}`;
  }
  if (product.category === "ai-membership") {
    return `/products/ai-membership?category=${getAiCategoryByProductId(product.id)}`;
  }
  if (product.category === "sim-cards") return "/products/sim-cards";
  return `/products/${product.category}`;
}

function getAiCategoryByProductId(productId: string) {
  if (productId.includes("claude")) return "claude";
  if (productId.includes("gemini")) return "gemini";
  if (productId.includes("grok")) return "grok";
  return "chatgpt";
}
