"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function ProductPagination({
  count,
  disabled,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  count: number;
  disabled?: boolean;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  if (count <= 0) return null;

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  return (
    <div className="mt-3 flex flex-col gap-3 border-t pt-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <div>
        共 {count} 个商品，第 {page} / {totalPages} 页
      </div>
      <div className="flex items-center gap-2">
        <Select
          value={String(pageSize)}
          disabled={disabled}
          onValueChange={(value) => onPageSizeChange(Number(value))}
        >
          <SelectTrigger className="h-9 w-[106px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[20, 40, 60].map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} 条/页
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          上一页
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}
