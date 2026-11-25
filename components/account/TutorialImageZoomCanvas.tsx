"use client";

import { Minus, Plus, RotateCcw } from "lucide-react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { Button } from "@/components/ui/button";

export default function TutorialImageZoomCanvas({
  src,
  caption,
  width,
  height,
}: {
  src: string;
  caption: string;
  width: number;
  height: number;
}) {
  return (
    <TransformWrapper minScale={1} maxScale={6} centerOnInit>
      {({ zoomIn, zoomOut, resetTransform }) => (
        <>
          <div className="flex flex-wrap items-center gap-2" aria-label="图片缩放工具">
            <Button type="button" size="sm" variant="outline" onClick={() => zoomOut(0.25, 0)} aria-label="缩小图片">
              <Minus className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => zoomIn(0.25, 0)} aria-label="放大图片">
              <Plus className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => resetTransform(0)}>
              <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
              复位
            </Button>
          </div>
          <div
            className="h-[min(68dvh,720px)] min-h-0 overflow-hidden rounded-xl border border-orange-100 bg-white"
            onContextMenu={(e) => e.preventDefault()}
          >
            <TransformComponent wrapperStyle={{ width: "100%", height: "100%", touchAction: "none" }} contentStyle={{ width: "100%", height: "100%" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={caption}
                draggable={false}
                width={width}
                height={height}
                onContextMenu={(e) => e.preventDefault()}
                className="h-full w-full select-none object-contain pointer-events-auto"
              />
            </TransformComponent>
          </div>
        </>
      )}
    </TransformWrapper>
  );
}
