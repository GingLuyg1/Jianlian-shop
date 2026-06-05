"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, KeyRound } from "lucide-react";
import PublicLayout from "@/components/layout/PublicLayout";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { interactiveButtonClass } from "./product-ui";

type DigitalCategoryId =
  | "apple-id"
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
  { id: "apple-id", name: "Apple ID", image: "/assets/digital-apple-id.svg" },
  { id: "gmail", name: "Gmail 邮箱", image: "/assets/digital-gmail.svg" },
  { id: "outlook", name: "Outlook 邮箱", image: "/assets/digital-outlook.svg" },
  { id: "telegram", name: "Telegram", image: "/assets/digital-telegram.svg" },
  { id: "whatsapp", name: "Whats App", image: "/assets/digital-whatsapp.svg" },
  { id: "tiktok", name: "Tiktok", image: "/assets/digital-tiktok.svg" },
  { id: "x", name: "X", image: "/assets/digital-x.svg" },
  { id: "instagram", name: "instagram", image: "/assets/digital-instagram.svg" },
  { id: "facebook", name: "Facebook", image: "/assets/digital-facebook.svg" },
  { id: "youtube", name: "YouTude", image: "/assets/digital-youtube.svg" },
  { id: "twitch", name: "Twitch", image: "/assets/digital-twitch.svg" },
];

export default function DigitalAccountsMallContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCategoryId = getValidDigitalCategoryId(
    searchParams.get("category")
  );
  const [selectedCategoryId, setSelectedCategoryId] =
    useState<DigitalCategoryId>(initialCategoryId);

  const selectedCategory =
    digitalCategories.find((category) => category.id === selectedCategoryId) ??
    digitalCategories[0];

  return (
    <PublicLayout contentClassName="max-w-none px-4 md:px-6 py-3 overflow-hidden">
      <div className="grid h-[calc(100vh-106px)] min-h-0 grid-cols-1 items-stretch gap-5 overflow-hidden lg:grid-cols-[270px_minmax(0,1fr)]">
        <CategoryPanel
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={(categoryId) => {
            setSelectedCategoryId(categoryId);
            router.replace(`/products/digital-accounts?category=${categoryId}`, {
              scroll: false,
            });
          }}
        />
        <ProductPanel selectedCategory={selectedCategory} />
      </div>
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
  onSelectCategory,
}: {
  selectedCategoryId: DigitalCategoryId;
  onSelectCategory: (categoryId: DigitalCategoryId) => void;
}) {
  return (
    <Card className="h-full min-h-0 overflow-hidden">
      <CardContent className="h-full min-h-0 p-4">
        <div className="flex h-full min-h-0 flex-col rounded-xl bg-gradient-to-b from-orange-50/55 to-white p-3">
          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1 sidebar-scroll">
            {digitalCategories.map((category) => (
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
  category: DigitalCategory;
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
}: {
  selectedCategory: DigitalCategory;
}) {
  return (
    <Card className="h-full min-h-0 overflow-hidden">
      <CardContent className="flex h-full min-h-0 flex-col overflow-hidden p-5">
        <div className="mb-4 shrink-0 rounded-lg border border-primary/15 bg-primary/5 px-5 py-4 text-[15px] text-primary">
          <div className="flex items-center gap-2 font-semibold">
            <KeyRound className="h-4 w-4" />
            <span>数字账号服务</span>
          </div>
          <div className="mt-1 text-primary/80">
            当前仅展示一级类目，二级类目和商品信息稍后补充。
          </div>
        </div>

        <div className="mb-4 shrink-0">
          <h1 className="text-xl font-bold">{selectedCategory.name}</h1>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            二级类目待补充
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-12 text-center sidebar-scroll">
          <div className="flex min-h-full items-center justify-center">
          <div>
            <img
              src={selectedCategory.image}
              alt={selectedCategory.name}
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
      </CardContent>
    </Card>
  );
}
