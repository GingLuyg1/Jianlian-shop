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
        isMobile && "!grid-cols-[clamp(108px,26vw,144px)_minmax(0,1fr)] !items-stretch min-h-[calc(100dvh-72px)] !overflow-visible !gap-2"
      )}
    >
      {children}
    </div>
  );
}
