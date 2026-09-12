"use client";

import { type ReactNode } from "react";

import { mallShellClassName } from "./product-ui";

export default function CategoryContentBoundary({ children }: { children: ReactNode }) {
  return (
    <div data-testid="storefront-category-layout" className={mallShellClassName}>
      {children}
    </div>
  );
}
