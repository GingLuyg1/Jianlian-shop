"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Sparkles } from "lucide-react";
import PublicLayout from "@/components/layout/PublicLayout";
import { Card, CardContent } from "@/components/ui/card";
import { products } from "@/lib/mock-data";
import { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  interactiveButtonClass,
  mallContentClassName,
  mallShellClassName,
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

  const selectedCategory =
    aiCategories.find((category) => category.id === selectedCategoryId) ??
    aiCategories[0];

  const aiProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          product.category === "ai-membership" &&
          product.listingStatus === "active" &&
          selectedCategory.productIds.includes(product.id)
      ),
    [selectedCategory]
  );

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
          selectedProductId={selectedProductId}
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
        <div className="flex h-full min-h-0 flex-col rounded-xl bg-slate-50/70 p-3">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 sidebar-scroll">
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
        "w-full rounded-lg px-4 py-4 flex items-center justify-between text-left",
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
            "h-10 w-10 shrink-0 rounded-xl object-cover",
            active ? "ring-2 ring-primary/25" : "ring-1 ring-slate-200"
          )}
        />
        <div className="min-w-0 truncate text-base font-semibold">
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
  selectedProductId,
  onSelectProduct,
}: {
  selectedCategory: AiCategory;
  products: Product[];
  selectedProductId: string | null;
  onSelectProduct: (productId: string) => void;
}) {
  return (
    <Card className="h-full min-h-0 overflow-hidden">
      <CardContent className="flex h-full min-h-0 flex-col overflow-hidden p-5">
        <div className="mb-5 rounded-lg border border-primary/15 bg-primary/5 px-5 py-4 text-[15px] text-primary">
          <div className="flex items-center gap-2 font-semibold">
            <Sparkles className="h-4 w-4" />
            <span>AI会员充值</span>
          </div>
          <div className="mt-1 text-primary/80">
            CDK 类商品属于一次性商品，售出后不支持无理由退换。
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">选择商品</h1>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
              共计{products.length}个商品
            </div>
          </div>
        </div>

        {products.length > 0 ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 sidebar-scroll">
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

        <div className="flex-1" />
      </CardContent>
    </Card>
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
        "w-full text-left rounded-xl border px-5 py-4 flex flex-col md:flex-row md:items-center gap-4",
        selected
          ? "scale-[1.012] bg-primary/10 border-primary/35 shadow-md"
          : "bg-slate-50 border-slate-100 hover:scale-[1.01] hover:bg-primary/5 hover:border-primary/20 hover:shadow-sm active:scale-[1.015]"
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
    <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-16 text-center">
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
  );
}

function getStockCount(product: Product) {
  const match = product.stockLabel.match(/\d+/);
  return match ? match[0] : product.stockStatus === "in-stock" ? "有货" : "0";
}
