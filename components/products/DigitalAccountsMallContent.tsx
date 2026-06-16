"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, KeyRound, Search } from "lucide-react";
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
  productPanelContentClassName,
  productListFiveRowsClassName,
  productSupportTextClassName,
  setProductImageFallback,
  shopNoticeClassName,
} from "./product-ui";
import CategoryContentBoundary from "./CategoryContentBoundary";
import { useCategorySwitch } from "./useCategorySwitch";

type DigitalCategoryId =
  | "apple-id"
  | "steam"
  | "gmail"
  | "outlook"
  | "telegram"
  | "whatsapp"
  | "tiktok"
  | "x"
  | "instagram"
  | "facebook"
  | "youtube"
  | "twitch";

type DigitalCategory = {
  id: DigitalCategoryId;
  name: string;
  image: string;
};

const digitalCategories: DigitalCategory[] = [
  { id: "apple-id", name: "Apple ID", image: "/assets/apple-id-icon.jpg" },
  { id: "steam", name: "Steam", image: "/assets/digital-steam.jpg" },
  { id: "gmail", name: "Gmail 邮箱", image: "/assets/digital-gmail.svg" },
  { id: "outlook", name: "Outlook 邮箱", image: "/assets/digital-outlook.svg" },
  { id: "telegram", name: "Telegram", image: "/assets/digital-telegram.svg" },
  { id: "whatsapp", name: "Whats App", image: "/assets/digital-whatsapp.svg" },
  { id: "tiktok", name: "Tiktok", image: "/assets/digital-tiktok.svg" },
  { id: "x", name: "X", image: "/assets/digital-x.svg" },
  { id: "instagram", name: "instagram", image: "/assets/digital-instagram.svg" },
  { id: "facebook", name: "Facebook", image: "/assets/digital-facebook.svg" },
  { id: "youtube", name: "YouTube", image: "/assets/digital-youtube.svg" },
  { id: "twitch", name: "Twitch", image: "/assets/digital-twitch.svg" },
];

const appleIdProductIds = [
  "dig-apple-id-ng",
  "dig-apple-id-tw",
  "dig-apple-id-jp",
  "dig-apple-id-au",
  "dig-apple-id-my",
  "dig-apple-id-tr",
  "dig-apple-id-sg",
  "dig-apple-id-de",
  "dig-apple-id-uk",
  "dig-apple-id-cn",
  "dig-apple-id-hk",
  "dig-apple-id-vn",
  "dig-apple-id-us",
];

const steamProductIds = [
  "dig-steam-ar",
  "dig-steam-ua",
  "dig-steam-jp",
  "dig-steam-tr",
  "dig-steam-br",
  "dig-steam-in",
];

const productIdsByDigitalCategory: Partial<Record<DigitalCategoryId, string[]>> = {
  "apple-id": appleIdProductIds,
  steam: steamProductIds,
};

const stockByProductId: Record<string, number> = {
  "dig-apple-id-ng": 235,
  "dig-apple-id-tw": 117,
  "dig-apple-id-jp": 169,
  "dig-apple-id-au": 30,
  "dig-apple-id-my": 22,
  "dig-apple-id-tr": 286,
  "dig-apple-id-sg": 31,
  "dig-apple-id-de": 21,
  "dig-apple-id-uk": 14,
  "dig-apple-id-cn": 99,
  "dig-apple-id-hk": 149,
  "dig-apple-id-vn": 23,
  "dig-apple-id-us": 381,
  "dig-steam-ar": 126,
  "dig-steam-ua": 0,
  "dig-steam-jp": 0,
  "dig-steam-tr": 0,
  "dig-steam-br": 0,
  "dig-steam-in": 0,
};

export default function DigitalAccountsMallContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCategoryId = getValidDigitalCategoryId(
    searchParams.get("category")
  );
  const getImageSources = useCallback((categoryId: DigitalCategoryId) => {
    const category =
      digitalCategories.find((item) => item.id === categoryId) ??
      digitalCategories[0];
    const productIds = productIdsByDigitalCategory[categoryId] ?? [];

    return [
      category.image,
      ...products
        .filter((product) => productIds.includes(product.id))
        .map(() => category.image),
    ];
  }, []);

  const {
    activeId: activeCategoryId,
    selectedId: selectedCategoryId,
    isSwitching,
    switchTo,
  } = useCategorySwitch({
    initialId: initialCategoryId,
    getImageSources,
  });

  const selectedCategory =
    digitalCategories.find((category) => category.id === activeCategoryId) ??
    digitalCategories[0];

  return (
    <PublicLayout contentClassName={mallContentClassName}>
      <CategoryContentBoundary isLoading={isSwitching}>
        <CategoryPanel
          selectedCategoryId={selectedCategoryId}
          disabled={isSwitching}
          onSelectCategory={(categoryId) => {
            switchTo(categoryId);
            router.replace(`/products/digital-accounts?category=${categoryId}`, {
              scroll: false,
            });
          }}
        />
        <ProductPanel selectedCategory={selectedCategory} />
      </CategoryContentBoundary>
    </PublicLayout>
  );
}

function getValidDigitalCategoryId(
  categoryId: string | null
): DigitalCategoryId {
  return digitalCategories.some((category) => category.id === categoryId)
    ? (categoryId as DigitalCategoryId)
    : "apple-id";
}

function CategoryPanel({
  selectedCategoryId,
  disabled,
  onSelectCategory,
}: {
  selectedCategoryId: DigitalCategoryId;
  disabled: boolean;
  onSelectCategory: (categoryId: DigitalCategoryId) => void;
}) {
  return (
    <Card className="h-full min-h-0 overflow-hidden">
      <CardContent className="h-full min-h-0 p-4">
        <div className={categoryPanelInnerClassName}>
          <div className={categoryListScrollClassName}>
            {digitalCategories.map((category) => (
              <CategoryButton
                key={category.id}
                category={category}
                active={selectedCategoryId === category.id}
                disabled={disabled}
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
  disabled,
  onClick,
}: {
  category: DigitalCategory;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
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
          onError={(event) => setProductImageFallback(event.currentTarget)}
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
}: {
  selectedCategory: DigitalCategory;
}) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const selectedProductIds = productIdsByDigitalCategory[selectedCategory.id] ?? [];
  const hasProducts = selectedProductIds.length > 0;
  const selectedProducts = useMemo(
    () =>
      products
        .filter((product) => selectedProductIds.includes(product.id))
        .sort(
          (first, second) =>
            selectedProductIds.indexOf(first.id) -
            selectedProductIds.indexOf(second.id)
        ),
    [selectedProductIds]
  );
  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return selectedProducts;

    return selectedProducts.filter(
      (product) =>
        product.name.toLowerCase().includes(query) ||
        product.description.toLowerCase().includes(query)
    );
  }, [selectedProducts, searchQuery]);

  return (
    <Card className="h-full min-h-0 overflow-hidden">
      <CardContent className={productPanelContentClassName}>
        {hasProducts ? <ShopNotice /> : <CategoryNotice />}

        <div className="mb-3 flex shrink-0 flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h1 className="text-xl font-bold">{selectedCategory.name}</h1>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  hasProducts ? "bg-green-500" : "bg-amber-400"
                )}
              />
              {hasProducts
                ? `共计${filteredProducts.length}个商品`
                : "二级类目待补充"}
            </div>
          </div>
          {hasProducts ? (
            <div className={compactSearchWrapperClassName}>
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7d6355]" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="请输入名称搜索"
                  className={compactSearchInputClassName}
                />
              </div>
              <Button className={compactSearchButtonClassName}>
                搜索
              </Button>
            </div>
          ) : null}
        </div>

        {hasProducts ? (
          <>
            <div className={productListFiveRowsClassName}>
              {filteredProducts.map((product) => (
                <DigitalProductRow
                  key={product.id}
                  product={product}
                  iconSrc={selectedCategory.image}
                  iconAlt={selectedCategory.name}
                  stock={stockByProductId[product.id] ?? 0}
                  onClick={() => router.push(`/checkout?product=${product.id}`)}
                />
              ))}
            </div>
            <div className={productSupportTextClassName}>
              如需补货或批量购买，请先联系在线客服确认库存。
              <button
                type="button"
                className="ml-1 text-primary underline-offset-4 hover:underline"
                {...({ popovertarget: "support-popover" } as Record<
                  string,
                  string
                >)}
              >
                联系客服
              </button>
            </div>
          </>
        ) : (
          <EmptyCategoryState selectedCategory={selectedCategory} />
        )}
      </CardContent>
    </Card>
  );
}

function CategoryNotice() {
  return (
    <div className="mb-4 shrink-0 rounded-lg border border-primary/15 bg-primary/5 px-5 py-4 text-[15px] text-primary">
      <div className="flex items-center gap-2 font-semibold">
        <KeyRound className="h-4 w-4" />
        <span>数字账号</span>
      </div>
      <div className="mt-1 text-primary/80">
        当前仅展示一级类目，二级类目和商品信息稍后补充。
      </div>
    </div>
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

function DigitalProductRow({
  product,
  iconSrc,
  iconAlt,
  stock,
  onClick,
}: {
  product: Product;
  iconSrc: string;
  iconAlt: string;
  stock: number;
  onClick: () => void;
}) {
  const inStock = stock > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        interactiveButtonClass,
        compactProductRowClassName
      )}
    >
      <div className="flex h-full min-h-[52px] items-center gap-4 md:gap-5">
        <img
          src={iconSrc}
          alt={iconAlt}
          onError={(event) => setProductImageFallback(event.currentTarget)}
          className="h-9 w-9 shrink-0 rounded-full object-cover"
        />
        <div className="min-w-0 flex-1 truncate text-base font-medium text-slate-600">
          {product.name}
        </div>
        <div className="hidden shrink-0 items-center gap-2 text-sm text-slate-600 md:flex">
          <span>库存：</span>
          <span
            className={cn(
              "font-semibold",
              inStock ? "text-green-500" : "text-red-500"
            )}
          >
            {stock}
          </span>
        </div>
        <div
          className={cn(
            "shrink-0 whitespace-nowrap text-right font-bold",
            inStock ? "text-blue-600" : "text-slate-300"
          )}
        >
          <span className="text-sm">¥</span>
          <span className="text-xl">{product.price.toFixed(2)}</span>
          <span className="ml-0.5 text-sm">起</span>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-sm text-slate-600 md:hidden">
        <span>库存：</span>
        <span
          className={cn(
            "font-semibold",
            inStock ? "text-green-500" : "text-red-500"
          )}
        >
          {stock}
        </span>
      </div>
    </button>
  );
}

function EmptyCategoryState({
  selectedCategory,
}: {
  selectedCategory: DigitalCategory;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-12 text-center sidebar-scroll">
      <div className="flex min-h-full items-center justify-center">
        <div>
          <img
            src={selectedCategory.image}
            alt={selectedCategory.name}
            onError={(event) => setProductImageFallback(event.currentTarget)}
            className="mx-auto mb-4 h-16 w-16 rounded-2xl object-cover ring-1 ring-slate-200"
          />
          <div className="text-base font-semibold">
            {selectedCategory.name}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            二级类目和商品信息稍后补充。
          </div>
        </div>
      </div>
    </div>
  );
}
