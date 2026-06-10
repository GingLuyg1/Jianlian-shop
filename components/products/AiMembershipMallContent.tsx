"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";
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

type AiCategoryId = "chatgpt" | "claude" | "gemini" | "grok";

type AiCategory = {
  id: AiCategoryId;
  name: string;
  image: string;
  productIds: string[];
};

const aiCategories: AiCategory[] = [
  {
    id: "chatgpt",
    name: "Chat Gpt",
    image: "/assets/ai-chatgpt-icon.jpg",
    productIds: ["ai-gpt-cdk-tr-plus-1m"],
  },
  {
    id: "claude",
    name: "Claude",
    image: "/assets/ai-claude-icon.jpg",
    productIds: [
      "ai-claude-cdk-ng-pro-1m",
      "ai-claude-cdk-ng-max-5x-1m",
      "ai-claude-cdk-ng-max-20x-1m",
    ],
  },
  {
    id: "gemini",
    name: "Geimini",
    image: "/assets/ai-gemini-icon.jpg",
    productIds: [
      "ai-gemini-google-one-pro-pixel",
      "ai-gemini-google-one-pro-pixel-1y",
    ],
  },
  {
    id: "grok",
    name: "Grok",
    image: "/assets/ai-grok-icon.jpg",
    productIds: ["ai-grok-cdk-in-super-1m"],
  },
];

export default function AiMembershipMallContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedCategoryId = getValidAiCategoryId(searchParams.get("category"));
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState("");

  const selectedCategory =
    aiCategories.find((category) => category.id === selectedCategoryId) ??
    aiCategories[0];

  const aiProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return products
      .filter(
        (product) =>
          product.category === "ai-membership" &&
          product.listingStatus === "active" &&
          selectedCategory.productIds.includes(product.id)
      )
      .filter((product) => {
        if (!query) return true;
        return (
          product.name.toLowerCase().includes(query) ||
          product.description.toLowerCase().includes(query)
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
            router.replace(`/products/ai-membership?category=${categoryId}`, {
              scroll: false,
            });
          }}
        />
        <ProductPanel
          selectedCategory={selectedCategory}
          products={aiProducts}
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

function getValidAiCategoryId(categoryId: string | null): AiCategoryId {
  return aiCategories.some((category) => category.id === categoryId)
    ? (categoryId as AiCategoryId)
    : "chatgpt";
}

function CategoryPanel({
  selectedCategoryId,
  onSelectCategory,
}: {
  selectedCategoryId: AiCategoryId;
  onSelectCategory: (categoryId: AiCategoryId) => void;
}) {
  return (
    <Card className="h-full min-h-0 overflow-hidden">
      <CardContent className="h-full min-h-0 p-4">
        <div className={categoryPanelInnerClassName}>
          <div className={categoryListScrollClassName}>
            {aiCategories.map((category) => (
              <CategoryButton
                key={category.id}
                category={category}
                active={selectedCategoryId === category.id}
                onClick={() => onSelectCategory(category.id)}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryButton({
  category,
  active,
  onClick,
}: {
  category: AiCategory;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        interactiveButtonClass,
        "w-full rounded-xl px-3.5 py-3 flex items-center justify-between text-left",
        active
          ? "scale-[1.015] border border-primary/25 bg-primary/10 text-primary shadow-sm"
          : "bg-white text-foreground border border-slate-100 hover:scale-[1.01] hover:border-primary/25 hover:bg-primary/5 hover:shadow-sm active:scale-[1.015]"
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <img
          src={category.image}
          alt={category.name}
          className={cn(
            "h-11 w-11 shrink-0 rounded-xl object-cover bg-white",
            active ? "ring-2 ring-primary/25" : "ring-1 ring-slate-200"
          )}
        />
        <div className="max-w-[130px] truncate whitespace-nowrap text-base font-semibold">
          {category.name}
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0" />
    </button>
  );
}

function ProductPanel({
  selectedCategory,
  products,
  searchQuery,
  selectedProductId,
  onSearchChange,
  onSelectProduct,
}: {
  selectedCategory: AiCategory;
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
            <h1 className="truncate text-xl font-bold">{selectedCategory.name}</h1>
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

        {products.length > 0 ? (
          <div className={productListFiveRowsClassName}>
            {products.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                image={selectedCategory.image}
                selected={selectedProductId === product.id}
                onClick={() => onSelectProduct(product.id)}
              />
            ))}
          </div>
        ) : (
          <EmptyProductState category={selectedCategory} />
        )}

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
  image,
  selected,
  onClick,
}: {
  product: Product;
  image: string;
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
          src={image}
          alt={product.categoryLabel}
          className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-slate-200"
        />
        <div className="min-w-0">
          <div className="truncate text-base font-medium">{product.name}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {product.description}
          </div>
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-[90px_120px] items-center gap-6">
        <div className="whitespace-nowrap text-sm">
          库存：
          <span
            className={cn(
              "font-semibold",
              product.stockStatus === "in-stock"
                ? "text-green-600"
                : "text-muted-foreground"
            )}
          >
            {getStockCount(product)}
          </span>
        </div>
        <div className="whitespace-nowrap text-right text-xl font-bold text-primary">
          &yen;{product.price.toFixed(2)}
        </div>
      </div>
    </button>
  );
}

function EmptyProductState({ category }: { category: AiCategory }) {
  return (
    <div className="h-[470px] min-h-0 w-[calc(100%-18px)] shrink-0 overflow-y-auto rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-16 text-center sidebar-scroll">
      <div className="flex min-h-full items-center justify-center">
      <div>
        <img
          src={category.image}
          alt={category.name}
          className="mx-auto mb-4 h-16 w-16 rounded-2xl object-cover ring-1 ring-slate-200"
        />
        <div className="text-base font-semibold">{category.name}</div>
        <div className="mt-1 text-sm text-muted-foreground">
          二级类目和商品信息稍后补充。
        </div>
      </div>
      </div>
    </div>
  );
}

function getStockCount(product: Product) {
  const match = product.stockLabel.match(/\d+/);
  return match ? match[0] : product.stockStatus === "in-stock" ? "有货" : "0";
}
