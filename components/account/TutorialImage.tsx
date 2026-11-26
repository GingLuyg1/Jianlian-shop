"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Maximize2 } from "lucide-react";
import OptionLoadingSpinner from "@/components/ui/OptionLoadingSpinner";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const TutorialImageZoomCanvas = dynamic(() => import("./TutorialImageZoomCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[320px] items-center justify-center gap-2 text-xs text-muted-foreground">
      <OptionLoadingSpinner active size="md" />
      <span>缩放视图加载中…</span>
    </div>
  ),
});

type TutorialImageProps = {
  src: string;
  caption: string;
  width: number;
  height: number;
  previewClassName?: string;
};

export default function TutorialImage({
  src,
  caption,
  width,
  height,
  previewClassName = "mx-auto h-auto max-h-[420px] w-full object-contain",
}: TutorialImageProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);

  useEffect(() => {
    // Cached images may finish before hydration attaches onLoad.
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) setLoaded(true);
  }, [src]);

  return (
    <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
      <figure
        className="min-w-0 overflow-hidden rounded-2xl border border-orange-100 bg-white"
        onContextMenu={(e) => e.preventDefault()}
      >
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={`查看大图：${caption}`}
            className="relative block w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            onContextMenu={(e) => e.preventDefault()}
          >
            {!loaded ? (
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 bg-gradient-to-br from-orange-50/90 via-[#fffaf4] to-orange-50/70 text-xs font-medium text-[#b57944]">
                <OptionLoadingSpinner active size="md" />
                <span>图片加载中…</span>
              </span>
            ) : null}
            {/* Full-resolution local assets are also used by the zoom canvas. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={src}
              alt={caption}
              width={width}
              height={height}
              draggable={false}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              onLoad={() => setLoaded(true)}
              onError={() => setLoaded(true)}
              onContextMenu={(e) => e.preventDefault()}
              className={`${previewClassName} select-none transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
            />
          </button>
        </DialogTrigger>
        <figcaption className="flex items-center justify-between gap-3 border-t border-orange-100 bg-orange-50/50 px-4 py-3 text-xs leading-5 text-slate-600">
          <span>{caption}</span>
          <Maximize2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        </figcaption>
      </figure>
      <DialogContent className="max-h-[96dvh] w-[calc(100%-1rem)] max-w-5xl gap-3 overflow-hidden rounded-2xl bg-[#fffaf4] p-3 motion-reduce:animate-none sm:p-5" overlayClassName="bg-stone-950/75 backdrop-blur-sm">
        <div className="pr-8">
          <DialogTitle className="text-base">{caption}</DialogTitle>
          <DialogDescription className="mt-1 text-xs">滚轮或双指缩放，放大后可拖动。按 Esc 关闭。</DialogDescription>
        </div>
        {zoomOpen ? <TutorialImageZoomCanvas src={src} caption={caption} width={width} height={height} /> : null}
      </DialogContent>
    </Dialog>
  );
}
