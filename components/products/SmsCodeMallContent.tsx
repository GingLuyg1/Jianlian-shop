"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, MessageCircle, Search } from "lucide-react";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { products } from "@/lib/mock-data";
import { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  categoryListScrollClassName,
  categoryPanelInnerClassName,
  compactProductRowClassName,
  compactSearchButtonClassName,
  compactSearchInputClassName,
  compactSearchWrapperClassName,
  interactiveButtonClass,
  mallContentClassName,
  mallShellClassName,
  productListFiveRowsClassName,
  productPanelContentClassName,
  productSupportTextClassName,
  shopNoticeClassName,
} from "./product-ui";

type SmsCountryId = "us" | "uk" | "ca" | "au" | "jp" | "sg" | "hk";

type SmsCountry = {
  id: SmsCountryId;
  name: string;
  code: string;
  productIds: string[];
};

const smsCountries: SmsCountry[] = [
  { id: "us", name: "美国", code: "US", productIds: ["sms-code-us"] },
  { id: "uk", name: "英国", code: "UK", productIds: ["sms-code-uk"] },
  { id: "ca", name: "加拿大", code: "CA", productIds: ["sms-code-ca"] },
  { id: "au", name: "澳大利亚", code: "AU", productIds: ["sms-code-au"] },
  { id: "jp", name: "日本", code: "JP", productIds: ["sms-code-jp"] },
  { id: "sg", name: "新加坡", code: "SG", productIds: ["sms-code-sg"] },
  { id: "hk", name: "香港", code: "HK", productIds: ["sms-code-hk"] },
];

export default function SmsCodeMallContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCountryId = getValidSmsCountryId(searchParams.get("country"));
  const [selectedCountryId, setSelectedCountryId] =
    useState<SmsCountryId>(initialCountryId);

  const selectedCountry =
    smsCountries.find((country) => country.id === selectedCountryId) ??
    smsCountries[0];

  return (
    <PublicLayout contentClassName={mallContentClassName}>
      <div className={mallShellClassName}>
        <CategoryPanel
          selectedCountryId={selectedCountryId}
          onSelectCountry={(countryId) => {
            setSelectedCountryId(countryId);
            router.replace(`/products/sms-code?country=${countryId}`, {
              scroll: false,
            });
          }}
        />
        <ProductPanel selectedCountry={selectedCountry} />
      </div>
    </PublicLayout>
  );
}

function getValidSmsCountryId(countryId: string | null): SmsCountryId {
  return smsCountries.some((country) => country.id === countryId)
    ? (countryId as SmsCountryId)
    : "us";
}

function CategoryPanel({
  selectedCountryId,
  onSelectCountry,
}: {
  selectedCountryId: SmsCountryId;
  onSelectCountry: (countryId: SmsCountryId) => void;
}) {
  return (
    <Card className="h-full min-h-0 overflow-hidden">
      <CardContent className="h-full min-h-0 p-4">
        <div className={categoryPanelInnerClassName}>
          <div className={categoryListScrollClassName}>
            {smsCountries.map((country) => (
              <CountryButton
                key={country.id}
                country={country}
                active={selectedCountryId === country.id}
                onClick={() => onSelectCountry(country.id)}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CountryButton({
  country,
  active,
  onClick,
}: {
  country: SmsCountry;
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
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-bold",
            active ? "ring-2 ring-primary/25" : "ring-1 ring-slate-200"
          )}
        >
          {country.code}
        </div>
        <div className="max-w-[130px] truncate whitespace-nowrap text-base font-semibold">
          {country.name}
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0" />
    </button>
  );
}

function ProductPanel({ selectedCountry }: { selectedCountry: SmsCountry }) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  const selectedProducts = useMemo(
    () =>
      products
        .filter(
          (product) =>
            product.category === "sms-code" &&
            product.listingStatus === "active" &&
            selectedCountry.productIds.includes(product.id)
        )
        .sort(
          (first, second) =>
            selectedCountry.productIds.indexOf(first.id) -
            selectedCountry.productIds.indexOf(second.id)
        ),
    [selectedCountry]
  );

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return selectedProducts;

    return selectedProducts.filter(
      (product) =>
        product.name.toLowerCase().includes(query) ||
        product.description.toLowerCase().includes(query)
    );
  }, [searchQuery, selectedProducts]);

  return (
    <Card className="h-full min-h-0 overflow-hidden">
      <CardContent className={productPanelContentClassName}>
        <ShopNotice />

        <div className="mb-3 flex shrink-0 flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h1 className="text-xl font-bold">{selectedCountry.name}</h1>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
              共计{filteredProducts.length}个商品
            </div>
          </div>
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
            <Button className={compactSearchButtonClassName}>搜索</Button>
          </div>
        </div>

        <div className={productListFiveRowsClassName}>
          {filteredProducts.map((product) => (
            <SmsProductRow
              key={product.id}
              product={product}
              country={selectedCountry}
              onClick={() => router.push(`/checkout?product=${product.id}`)}
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
          <li>1. 下单之前请一定一定要看清商品说明，非商品问题一经售出不退不换~</li>
          <li>
            2. 接码服务按国家 SKU 库存展示，库存变动较快，下单前请确认国家和平台要求。
          </li>
          <li>
            3. 切记，<span className="font-semibold text-red-600">拿到结果第一时间检查</span>。
            售后期限为<span className="font-semibold text-red-600">24小时</span>，请勿扯皮！
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

function SmsProductRow({
  product,
  country,
  onClick,
}: {
  product: Product;
  country: SmsCountry;
  onClick: () => void;
}) {
  const stock = getStockCount(product);
  const inStock = stock > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(interactiveButtonClass, compactProductRowClassName)}
    >
      <div className="flex h-full min-h-[52px] items-center gap-4 md:gap-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MessageCircle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-medium text-slate-700">
            {product.name}
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {country.name} / {country.code} / 自动处理
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-2 text-sm text-slate-600 md:flex">
          <span>库存：</span>
          <span
            className={cn("font-semibold", inStock ? "text-green-500" : "text-red-500")}
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
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-sm text-slate-600 md:hidden">
        <span>库存：</span>
        <span
          className={cn("font-semibold", inStock ? "text-green-500" : "text-red-500")}
        >
          {stock}
        </span>
      </div>
    </button>
  );
}

function getStockCount(product: Product) {
  const match = product.stockLabel.match(/\d+/);
  return match ? Number(match[0]) : product.stockStatus === "in-stock" ? 1 : 0;
}
