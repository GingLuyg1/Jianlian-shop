"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Gift, Phone, Search } from "lucide-react";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { products } from "@/lib/mock-data";
import { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  categoryPanelInnerClassName,
  categoryListScrollClassName,
  compactProductRowClassName,
  compactSearchButtonClassName,
  compactSearchInputClassName,
  compactSearchWrapperClassName,
  interactiveButtonClass,
  mallContentClassName,
  mallShellClassName,
  productPanelContentClassName,
  productListFiveRowsClassName,
  productSupportTextClassName,
  shopNoticeClassName,
} from "./product-ui";

type GiftCategoryId = "apple" | "giffgaff";

const giftCategories: Array<{
  id: GiftCategoryId;
  name: string;
  productIds: string[];
  icon: typeof Gift;
}> = [
  {
    id: "apple",
    name: "Apple 礼品卡",
    productIds: ["gift-apple-tr-500", "gift-apple-us"],
    icon: Gift,
  },
  {
    id: "giffgaff",
    name: "GiffGaff",
    productIds: ["gift-giffgaff-topup"],
    icon: Phone,
  },
];

const PRICE_LABELS: Record<string, string> = {
  "gift-apple-us": "\u00a514.84-\u00a5742.00",
  "gift-giffgaff-topup": "\u00a5107.80-\u00a5215.60",
};

export default function GiftCardsMallContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedCategoryId =
    searchParams.get("category") === "giffgaff" ? "giffgaff" : "apple";
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null
  );
  const selectedCategory =
    giftCategories.find((category) => category.id === selectedCategoryId) ??
    giftCategories[0];

  const giftProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products
      .filter(
        (product) =>
          product.category === "gift-cards" &&
          product.listingStatus === "active" &&
          selectedCategory.productIds.includes(product.id)
      )
      .filter((product) => {
        if (!q) return true;
        return (
          product.name.toLowerCase().includes(q) ||
          product.description.toLowerCase().includes(q)
        );
      });
  }, [searchQuery, selectedCategory]);

  return (
    <PublicLayout contentClassName={mallContentClassName}>
      <div className={mallShellClassName}>
        <CategoryPanel
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={(categoryId) => {
            setSelectedProductId(null);
            router.replace(`/products/gift-cards?category=${categoryId}`, {
              scroll: false,
            });
          }}
        />
        <ProductPanel
          selectedCategoryName={selectedCategory.name}
          products={giftProducts}
          searchQuery={searchQuery}
          selectedProductId={selectedProductId}
          onSearchChange={setSearchQuery}
          onSelectProduct={(productId) => {
            setSelectedProductId(productId);
            router.push(`/checkout?product=${productId}`);
          }}
        />
      </div>
    </PublicLayout>
  );
}

function CategoryPanel({
  selectedCategoryId,
  onSelectCategory,
}: {
  selectedCategoryId: GiftCategoryId;
  onSelectCategory: (categoryId: GiftCategoryId) => void;
}) {
  return (
    <Card className="h-full min-h-0 overflow-hidden">
      <CardContent className="h-full min-h-0 p-4">
        <div className={categoryPanelInnerClassName}>
          <div className={categoryListScrollClassName}>
            {giftCategories.map((category) => {
              const Icon = category.icon;
              const selected = selectedCategoryId === category.id;

              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => onSelectCategory(category.id)}
                  className={cn(
                    interactiveButtonClass,
                    "w-full rounded-xl px-3.5 py-3 flex items-center justify-between text-left",
                    selected
                      ? "scale-[1.015] border border-primary/25 bg-primary/10 text-primary shadow-sm"
                      : "border border-slate-100 bg-white text-foreground hover:scale-[1.01] hover:border-primary/25 hover:bg-primary/5"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white",
                        selected ? "bg-primary/15" : "bg-primary/10"
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-7 w-7",
                          "text-primary"
                        )}
                      />
                    </div>
                    <div>
                      <div className="max-w-[130px] truncate whitespace-nowrap text-base font-semibold">
                        {category.name}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductPanel({
  selectedCategoryName,
  products,
  searchQuery,
  selectedProductId,
  onSearchChange,
  onSelectProduct,
}: {
  selectedCategoryName: string;
  products: Product[];
  searchQuery: string;
  selectedProductId: string | null;
  onSearchChange: (query: string) => void;
  onSelectProduct: (productId: string) => void;
}) {
  return (
    <Card className="h-full min-h-0 overflow-hidden">
      <CardContent className={productPanelContentClassName}>
        <ShopNotice />

        <div className="mb-3 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h1 className="truncate text-xl font-bold">{selectedCategoryName}</h1>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
              共计{products.length}个商品
            </div>
          </div>
          <div className={compactSearchWrapperClassName}>
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7d6355]" />
              <Input
                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="请输入名称搜索"
                className={compactSearchInputClassName}
              />
            </div>
            <Button className={compactSearchButtonClassName}>搜索</Button>
          </div>
        </div>

        <div className={productListFiveRowsClassName}>
          {products.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              selected={selectedProductId === product.id}
              onClick={() => onSelectProduct(product.id)}
            />
          ))}
        </div>

        <div className={productSupportTextClassName}>
          如需补货或批量购买，请先联系在线客服确认库存。
          <button
            type="button"
            className="ml-1 text-primary underline-offset-4 hover:underline"
            {...({ popovertarget: "support-popover" } as Record<string, string>)}
          >
            联系客服
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function ShopNotice() {
  return (
    <div className={shopNoticeClassName}>
      <div className="leading-relaxed">
        <div className="mb-1 font-semibold">选购请注意</div>
        <ol className="m-0 list-none space-y-1 p-0 text-left text-primary/90">
          <li>
            1. 下单之前请一定一定要看清商品说明，非商品问题一经售出不退不换~
          </li>
          <li>
            2. 本店在技术范围内会尽力保障商品的可用性，所有商品如无单独标注，售后期均为商品发货
            <span className="font-semibold text-red-600">24小时内</span>。
          </li>
          <li>
            3. 切记，
            <span className="font-semibold text-red-600">
              拿到账号第一时间检查账号
            </span>
            。售后期限为
            <span className="font-semibold text-red-600">24小时</span>
            ，请勿扯皮！
          </li>
          <li>
            4.{" "}
            <span className="font-semibold text-red-600">
              本站产品拒绝任何违法行为，不提供任何教程（仅限登录），不为任何非法行业提供任何支持，仅提供电商拓客服务。
            </span>
          </li>
        </ol>
      </div>
    </div>
  );
}

function ProductRow({
  product,
  selected,
  onClick,
}: {
  product: Product;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        interactiveButtonClass,
        compactProductRowClassName,
        "flex flex-col gap-4 md:flex-row md:items-center",
        selected
          ? "scale-[1.012] bg-primary/10 border-primary/35 shadow-md"
          : ""
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <img
          src={getGiftProductImage(product)}
          alt={product.categoryLabel}
          className="h-12 w-12 shrink-0 rounded-xl object-cover"
        />
        <div className="min-w-0">
          <div className="truncate text-base font-medium">{product.name}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {product.description}
          </div>
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-[80px_minmax(170px,auto)] items-center gap-4">
        <div className="whitespace-nowrap text-sm">
          库存：
          <span className="font-semibold text-green-600">0</span>
        </div>
        <div className="min-w-0 whitespace-nowrap text-right text-lg font-bold leading-none text-primary xl:text-xl">
          {PRICE_LABELS[product.id] ?? `\u00a5${product.price.toFixed(2)}`}
        </div>
      </div>
    </button>
  );
}

function getGiftProductImage(product: Product) {
  if (product.id === "gift-giffgaff-topup") return "/assets/giffgaff-icon.svg";
  return "/assets/apple-gift-card-icon.jpg";
}
