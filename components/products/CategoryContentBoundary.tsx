"use client";

import { type ReactNode } from "react";

export default function CategoryContentBoundary({ children }: { children: ReactNode }) {
  return (
    <div className="relative grid h-[calc(100dvh-87px)] min-h-0 grid-cols-1 items-stretch gap-5 overflow-hidden lg:grid-cols-[270px_minmax(0,1fr)]">
      {children}
    </div>
  );
}
