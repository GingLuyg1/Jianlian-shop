"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

/** One vertical table viewport, with an independently accessible horizontal rail. */
export default function AdminSyncedHorizontalScroller({ children }: { children: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => setWidth(viewport.scrollWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    measure();
    return () => observer.disconnect();
  }, [children]);
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <div ref={viewportRef} className="min-h-0 flex-1 overflow-auto"
        onScroll={() => {
          if (railRef.current && viewportRef.current && railRef.current.scrollLeft !== viewportRef.current.scrollLeft)
            railRef.current.scrollLeft = viewportRef.current.scrollLeft;
        }}>
        {children}
      </div>
      <div ref={railRef} tabIndex={0} role="region" aria-label="商品表格横向滚动"
        className="sticky bottom-0 z-30 h-5 shrink-0 overflow-x-auto overflow-y-hidden border-t bg-white"
        onScroll={() => {
          if (viewportRef.current && railRef.current && viewportRef.current.scrollLeft !== railRef.current.scrollLeft)
            viewportRef.current.scrollLeft = railRef.current.scrollLeft;
        }}>
        <div style={{ width, height: 1 }} />
      </div>
    </div>
  );
}
