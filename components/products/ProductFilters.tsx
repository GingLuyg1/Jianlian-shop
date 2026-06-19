"use client";

import { RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getDeliveryLabel } from "@/lib/catalog/product-status";

export type ProductSortValue = "default" | "price_asc" | "price_desc" | "newest";
export type ProductStockFilter = "all" | "in_stock" | "out_of_stock" | "sold_out";

export default function ProductFilters({
  deliveryOptions,
  deliveryType,
  disabled,
  onDeliveryTypeChange,
  onReset,
  onSearch,
  onSearchInputChange,
  onSortChange,
  onStockChange,
  searchInput,
  sort,
  stock,
  totalCount,
}: {
  deliveryOptions: string[];
  deliveryType: string;
  disabled?: boolean;
  onDeliveryTypeChange: (value: string) => void;
  onReset: () => void;
  onSearch: () => void;
  onSearchInputChange: (value: string) => void;
  onSortChange: (value: ProductSortValue) => void;
  onStockChange: (value: ProductStockFilter) => void;
  searchInput: string;
  sort: ProductSortValue;
  stock: ProductStockFilter;
  totalCount: number;
}) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900">商品筛选</div>
        <div className="text-xs text-muted-foreground">共 {totalCount} 个结果</div>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_150px_150px_170px_82px]">
        <div className="flex min-w-0 gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              disabled={disabled}
              onChange={(event) => onSearchInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onSearch();
              }}
              placeholder="搜索商品名称、标识或说明"
              className="h-10 pl-9"
            />
          </div>
          <Button
            type="button"
            disabled={disabled}
            onClick={onSearch}
            className="h-10 shrink-0"
          >
            搜索
          </Button>
        </div>

        <Select
          value={sort}
          disabled={disabled}
          onValueChange={(value) => onSortChange(value as ProductSortValue)}
        >
          <SelectTrigger className="h-10">
            <SelectValue placeholder="综合排序" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">综合排序</SelectItem>
            <SelectItem value="price_asc">价格从低到高</SelectItem>
            <SelectItem value="price_desc">价格从高到低</SelectItem>
            <SelectItem value="newest">最新商品</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={stock}
          disabled={disabled}
          onValueChange={(value) => onStockChange(value as ProductStockFilter)}
        >
          <SelectTrigger className="h-10">
            <SelectValue placeholder="库存状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部库存</SelectItem>
            <SelectItem value="in_stock">有库存</SelectItem>
            <SelectItem value="out_of_stock">暂时缺货</SelectItem>
            <SelectItem value="sold_out">已售罄</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={deliveryType || "all"}
          disabled={disabled}
          onValueChange={(value) => onDeliveryTypeChange(value === "all" ? "" : value)}
        >
          <SelectTrigger className="h-10">
            <SelectValue placeholder="交付方式" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部交付</SelectItem>
            {deliveryOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {getDeliveryLabel(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={onReset}
          className="h-10"
        >
          <RotateCcw className="mr-1.5 h-4 w-4" />
          重置
        </Button>
      </div>
    </div>
  );
}
