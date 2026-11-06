"use client";

import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type TutorialImageProps = {
  src: string;
  caption: string;
  width: number;
  height: number;
  previewClassName?: string;
};

export default function TutorialImage({ src, caption, width, height, previewClassName = "mx-auto h-auto max-h-[420px] w-full object-contain" }: TutorialImageProps) {
  return (
    <Dialog>
      <figure className="min-w-0 overflow-hidden rounded-2xl border border-orange-100 bg-white">
        <DialogTrigger asChild>
          <button type="button" aria-label={`查看大图：${caption}`} className="block w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
            {/* Full-resolution local assets are also used by the zoom canvas. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={caption} width={width} height={height} loading="lazy" decoding="async" className={previewClassName} />
          </button>
        </DialogTrigger>
        <figcaption className="flex items-center justify-between gap-3 border-t border-orange-100 bg-orange-50/50 px-4 py-3 text-xs leading-5 text-slate-600">
          <span>{caption}</span><Maximize2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        </figcaption>
      </figure>
      <DialogContent className="max-h-[96dvh] w-[calc(100%-1rem)] max-w-5xl gap-3 overflow-hidden rounded-2xl bg-[#fffaf4] p-3 motion-reduce:animate-none sm:p-5" overlayClassName="bg-stone-950/75 backdrop-blur-sm">
        <div className="pr-8"><DialogTitle className="text-base">{caption}</DialogTitle><DialogDescription className="mt-1 text-xs">滚轮或双指缩放，放大后可拖动。按 Esc 关闭。</DialogDescription></div>
        <TransformWrapper minScale={1} maxScale={6} centerOnInit>
          {({ zoomIn, zoomOut, resetTransform }) => <>
            <div className="flex flex-wrap items-center gap-2" aria-label="图片缩放工具">
              <Button type="button" size="sm" variant="outline" onClick={() => zoomOut(0.25, 0)} aria-label="缩小图片"><Minus className="h-4 w-4" aria-hidden="true" /></Button>
              <Button type="button" size="sm" variant="outline" onClick={() => zoomIn(0.25, 0)} aria-label="放大图片"><Plus className="h-4 w-4" aria-hidden="true" /></Button>
              <Button type="button" size="sm" variant="outline" onClick={() => resetTransform(0)}><RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />复位</Button>
            </div>
            <div className="h-[min(68dvh,720px)] min-h-0 overflow-hidden rounded-xl border border-orange-100 bg-white">
              <TransformComponent wrapperStyle={{ width: "100%", height: "100%", touchAction: "none" }} contentStyle={{ width: "100%", height: "100%" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={caption} draggable={false} width={width} height={height} className="h-full w-full select-none object-contain" />
              </TransformComponent>
            </div>
          </>}
        </TransformWrapper>
      </DialogContent>
    </Dialog>
  );
}
