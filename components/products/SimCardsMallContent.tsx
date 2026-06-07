"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, CreditCard, Search } from "lucide-react";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { products } from "@/lib/mock-data";
import { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  interactiveButtonClass,
  mallContentClassName,
  mallShellClassName,
} from "./product-ui";

type CountryTab = {
  id: "uk" | "us";
  name: string;
  image: string;
};

const COUNTRY_TABS: CountryTab[] = [
  {
    id: "uk",
    name: "\u82f1\u56fd",
    image: "/assets/sim-uk-icon.png",
  },
  {
    id: "us",
    name: "\u7f8e\u56fd",
    image: "/assets/sim-us-icon.png",
  },
];

const PRODUCT_COUNTRY: Record<string, CountryTab["id"]> = {
  "sim-001": "uk",
  "sim-002": "uk",
  "sim-003": "uk",
  "sim-us-001": "us",
};

export default function SimCardsMallContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const countryParam = searchParams.get("country");
  const selectedCountry: CountryTab["id"] =
    countryParam === "us" || countryParam === "uk" ? countryParam : "uk";
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null
  );

  const simProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products
      .filter(
        (product) =>
          product.category === "sim-cards" &&
          product.listingStatus === "active" &&
          PRODUCT_COUNTRY[product.id] === selectedCountry
      )
      .filter((product) => {
        if (!q) return true;
        return (
          product.name.toLowerCase().includes(q) ||
          product.description.toLowerCase().includes(q)
        );
      });
  }, [searchQuery, selectedCountry]);

  return (
    <PublicLayout contentClassName={mallContentClassName}>
      <div className={mallShellClassName}>
        <CountryPanel
          selectedCountry={selectedCountry}
          onSelectCountry={() => setSelectedProductId(null)}
        />

        <ProductPanel
          products={simProducts}
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

function CountryPanel({
  selectedCountry,
  onSelectCountry,
}: {
  selectedCountry: CountryTab["id"];
  onSelectCountry: () => void;
}) {
  return (
    <Card className="h-full min-h-0 overflow-hidden">
      <CardContent className="h-full min-h-0 p-4">
        <div className="flex h-full min-h-0 flex-col rounded-xl bg-slate-50/70 p-3">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 sidebar-scroll">
            {COUNTRY_TABS.map((country) => (
              <CountryButton
                key={country.id}
                country={country}
                active={selectedCountry === country.id}
                onClick={onSelectCountry}
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
  country: CountryTab;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Link
      href={`/products/sim-cards?country=${country.id}`}
      data-testid={`country-${country.id}`}
      onClick={onClick}
      className={cn(
        interactiveButtonClass,
        "w-full rounded-lg px-4 py-4 flex items-center justify-between text-left",
        active
          ? "scale-[1.015] border border-primary/25 bg-primary/10 text-primary shadow-sm"
          : "bg-white text-slate-700 border border-slate-100 hover:scale-[1.01] hover:border-primary/25 hover:bg-primary/5 hover:shadow-sm active:scale-[1.015]"
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "h-10 w-10 overflow-hidden rounded-xl ring-1",
            active ? "ring-primary/25" : "ring-slate-200"
          )}
        >
          <img
            src={country.image}
            alt={country.name}
            className="h-full w-full object-cover"
          />
        </div>
        <div>
          <div className="text-base font-semibold">{country.name}</div>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0" />
    </Link>
  );
}

function ProductPanel({
  products,
  searchQuery,
  selectedProductId,
  onSearchChange,
  onSelectProduct,
}: {
  products: Product[];
  searchQuery: string;
  selectedProductId: string | null;
  onSearchChange: (query: string) => void;
  onSelectProduct: (productId: string) => void;
}) {
  return (
    <Card className="h-full min-h-0 overflow-hidden">
      <CardContent className="flex h-full min-h-0 flex-col overflow-hidden p-5">
        <ShopNotice />

        <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h1 className="text-xl font-bold">{"\u9009\u62e9\u5546\u54c1"}</h1>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
              {"\u5171\u8ba1"}
              {products.length}
              {"\u4e2a\u5546\u54c1"}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={"\u8bf7\u8f93\u5165\u540d\u79f0\u641c\u7d22"}
                className="h-10 pl-9 text-sm"
              />
            </div>
            <Button className="h-10 px-7">{"\u641c\u7d22"}</Button>
          </div>
        </div>

        {products.length > 0 ? (
          <div
            className={cn(
              "space-y-3",
              products.length > 4
                ? "min-h-0 flex-1 overflow-y-auto pr-1 sidebar-scroll"
                : "shrink-0 overflow-visible"
            )}
          >
            {products.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                selected={selectedProductId === product.id}
                onClick={() => onSelectProduct(product.id)}
              />
            ))}
          </div>
        ) : (
          <EmptyProductState />
        )}

        <div className="mt-5 text-sm text-muted-foreground">
          {
            "\u5982\u9700\u8865\u8d27\u6216\u6279\u91cf\u8d2d\u4e70\uff0c\u8bf7\u5148\u8054\u7cfb\u5728\u7ebf\u5ba2\u670d\u786e\u8ba4\u5e93\u5b58\u3002"
          }
          <Link href="mailto:support@jianlian.shop" className="ml-1 text-primary">
            {"\u8054\u7cfb\u5ba2\u670d"}
          </Link>
        </div>

        <div className="flex-1" />
      </CardContent>
    </Card>
  );
}

function ShopNotice() {
  return (
    <div className="mb-5 rounded-lg border border-primary/15 bg-primary/5 px-5 py-4 text-[15px] text-primary">
      <div className="leading-relaxed">
        <div className="mb-1.5 font-semibold">选购请注意</div>
        <ol className="m-0 list-none space-y-1 p-0 text-left text-primary/90">
          <li>1. 下单之前请一定一定要看清商品说明，非商品问题一经售出不退不换~</li>
          <li>2. 本店在技术范围内会尽力保障商品的可用性，所有商品如无单独标注，售后期均为商品发货24小时内。</li>
          <li>3. 切记，拿到账号第一时间检查账号。售后期限为24小时，请勿扯皮！</li>
          <li>4. 本站产品拒绝任何违法行为，不提供任何教程（仅限登录），不为任何非法行业提供任何支持，仅提供电商拓客服务。</li>
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
  const productName = product.name.toLowerCase();
  const iconSrc = productName.includes("giffgaff")
    ? "/assets/giffgaff-icon.svg"
    : productName.includes("ultra")
      ? "/assets/ultra-mobile-icon.svg"
      : null;

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
        {iconSrc ? (
          <img
            src={iconSrc}
            alt={product.name}
            className="h-12 w-12 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <CreditCard className="h-6 w-6 text-primary" />
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate text-base font-medium">{product.name}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {product.description}
          </div>
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-[90px_130px] items-center gap-6">
        <div className="whitespace-nowrap text-sm">
          {"\u5e93\u5b58\uff1a"}
          <span className="font-semibold text-green-600">0</span>
        </div>
        <div className="whitespace-nowrap text-right text-xl font-bold text-primary">
          &yen;{product.price.toFixed(2)}
        </div>
      </div>
    </button>
  );
}

function EmptyProductState() {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-16 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Search className="h-6 w-6 text-primary" />
      </div>
      <div className="text-base font-semibold">{"\u6682\u65e0\u5546\u54c1"}</div>
      <div className="mt-1 text-sm text-muted-foreground">
        {
          "\u5f53\u524d\u7c7b\u76ee\u5546\u54c1\u6682\u672a\u4e0a\u67b6\uff0c\u8bf7\u5148\u67e5\u770b\u5176\u4ed6\u4e00\u7ea7\u7c7b\u76ee\u3002"
        }
      </div>
    </div>
  );
}
