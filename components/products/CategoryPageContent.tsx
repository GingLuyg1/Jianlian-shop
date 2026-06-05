"use client";

/**
 * CategoryPageContent - Shared content component for product category pages
 *
 * Each category page uses this component with a specific category ID.
 * Provides: page title, search bar, category tabs, filter/sort, product grid.
 * Uses PublicLayout. No footer. No cart.
 */

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";
import PublicLayout from "@/components/layout/PublicLayout";
import ProductGrid from "@/components/products/ProductGrid";
import { products, categories } from "@/lib/mock-data";
import { ProductCategory } from "@/lib/types";

interface CategoryPageContentProps {
  categoryId: ProductCategory;
  title: string;
}

export default function CategoryPageContent({
  categoryId,
  title,
}: CategoryPageContentProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("default");

  const filteredProducts = useMemo(() => {
    let result = products.filter(
      (p) => p.category === categoryId && p.listingStatus === "active"
    );

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q)
      );
    }

    if (sortBy === "price-asc") {
      result = [...result].sort((a, b) => a.price - b.price);
    } else if (sortBy === "price-desc") {
      result = [...result].sort((a, b) => b.price - a.price);
    }

    return result;
  }, [categoryId, searchQuery, sortBy]);

  return (
    <PublicLayout>
      {/* Page title */}
      <h1 className="text-xl font-bold text-foreground mb-4">{title}</h1>

      {/* Search and sort */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索商品..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-full sm:w-36 h-9">
            <SelectValue placeholder="排序方式" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">默认排序</SelectItem>
            <SelectItem value="price-asc">价格从低到高</SelectItem>
            <SelectItem value="price-desc">价格从高到低</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Category tabs for navigation between categories */}
      <Tabs defaultValue={categoryId} className="mb-4">
        <TabsList className="h-9 flex-wrap">
          {categories.map((cat) => (
            <TabsTrigger
              key={cat.id}
              value={cat.id}
              className="text-xs h-7"
              onClick={() => {
                if (cat.id !== categoryId) {
                  window.location.href = cat.href;
                }
              }}
            >
              {cat.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Product grid */}
      <ProductGrid
        products={filteredProducts}
        emptyMessage={`${title}暂无商品`}
      />
    </PublicLayout>
  );
}
