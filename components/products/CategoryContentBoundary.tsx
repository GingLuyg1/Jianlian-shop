"use client";

import { type ReactNode } from "react";

import { useMobileStorefront } from "@/hooks/use-mobile-storefront";
import { cn } from "@/lib/utils";
import { mallShellClassName } from "./product-ui";

export default function CategoryContentBoundary({ children }: { children: ReactNode }) {
  const { isMobile } = useMobileStorefront();
  return (
    <div
      data-testid="storefront-category-layout"
      className={cn(
        mallShellClassName,
        isMobile && "!grid-cols-[76px_minmax(0,1fr)] !items-start !h-auto !overflow-visible !gap-2"
      )}
    >
      {children}
    </div>
  );
}
