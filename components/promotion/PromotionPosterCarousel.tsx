"use client";

import { useCallback, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";

import { PROMOTION_POSTERS, type PromotionPosterSpec } from "@/lib/promotion";
import { cn } from "@/lib/utils";

type PromotionPosterCarouselProps = {
  inviteUrl: string;
  inviteCode: string;
};

export default function PromotionPosterCarousel({
  inviteUrl,
  inviteCode,
}: PromotionPosterCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const qrHiddenContainerRef = useRef<HTMLDivElement | null>(null);

  const poster: PromotionPosterSpec = PROMOTION_POSTERS[activeIndex] ?? PROMOTION_POSTERS[0];
  const effectiveUrl = inviteUrl || "https://www.jianlian.shop/register";

  const handlePrev = () => {
    setActiveIndex((prev) => (prev - 1 + PROMOTION_POSTERS.length) % PROMOTION_POSTERS.length);
  };

  const handleNext = () => {
    setActiveIndex((prev) => (prev + 1) % PROMOTION_POSTERS.length);
  };

  const handleDownloadPoster = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const qrCanvas = qrHiddenContainerRef.current?.querySelector("canvas");
      if (!qrCanvas) {
        toast.error("二维码尚未生成，请稍后重试");
        return;
      }

      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.crossOrigin = "anonymous";
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("海报底图加载失败"));
        el.src = poster.src;
      });

      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || poster.width;
      canvas.height = img.naturalHeight || poster.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("浏览器不支持 Canvas 合成");

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Compute exact square QR placement centered inside the poster's reserved white slot
      const slotX = poster.qrSlot.x * canvas.width;
      const slotY = poster.qrSlot.y * canvas.height;
      const slotW = poster.qrSlot.w * canvas.width;
      const slotH = poster.qrSlot.h * canvas.height;
      const padRatio = poster.qrSlot.paddingPct ?? 0.04;
      const innerSize = Math.min(slotW, slotH) * (1 - padRatio * 2);
      const drawX = slotX + (slotW - innerSize) / 2;
      const drawY = slotY + (slotH - innerSize) / 2;

      // Paint crisp white backing inside slot before drawing QR so edges stay ultra clean
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(drawX - 2, drawY - 2, innerSize + 4, innerSize + 4);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(qrCanvas, drawX, drawY, innerSize, innerSize);

      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `jianlian-promotion-${poster.id}-${inviteCode || "share"}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(`已下载「${poster.label}」专属推广海报`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "海报合成下载失败，请稍后重试");
    } finally {
      setDownloading(false);
    }
  }, [downloading, inviteCode, poster]);

  // Square QR box geometry in percentage relative to the poster container
  const boxLeftPct = poster.qrSlot.x * 100;
  const boxTopPct = poster.qrSlot.y * 100;
  const boxWidthPct = poster.qrSlot.w * 100;
  const boxHeightPct = poster.qrSlot.h * 100;

  return (
    <div className="flex flex-col items-center">
      {/* Hidden high-resolution QR canvas used for crisp PNG export */}
      <div ref={qrHiddenContainerRef} className="sr-only" aria-hidden="true">
        <QRCodeCanvas
          value={effectiveUrl}
          size={512}
          level="M"
          bgColor="#ffffff"
          fgColor="#0f172a"
          marginSize={1}
        />
      </div>

      {/* Poster Preview with Prev/Next arrows */}
      <div className="relative flex w-full items-center justify-center gap-2">
        <button
          type="button"
          onClick={handlePrev}
          aria-label="上一张推广海报"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-orange-200/80 bg-white/90 text-slate-600 shadow-xs transition hover:border-primary/40 hover:bg-orange-50 hover:text-primary"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div
          data-testid="promotion-poster-preview"
          className="relative aspect-[3/4] w-[212px] overflow-hidden rounded-2xl border border-orange-100/90 bg-white shadow-md sm:w-[228px]"
        >
          <img
            src={poster.src}
            alt={`简联商城推广海报 - ${poster.label}`}
            className="h-full w-full object-cover select-none"
            draggable={false}
          />
          {/* Live QR overlay aligned precisely to the poster's white QR box */}
          <div
            data-testid="promotion-poster-qr-slot"
            style={{
              left: `${boxLeftPct}%`,
              top: `${boxTopPct}%`,
              width: `${boxWidthPct}%`,
              height: `${boxHeightPct}%`,
            }}
            className="pointer-events-none absolute flex items-center justify-center p-[3%]"
          >
            <div className="flex aspect-square h-full max-h-full max-w-full items-center justify-center rounded-[4px] bg-white p-[3%]">
              <QRCodeCanvas
                value={effectiveUrl}
                size={160}
                level="M"
                bgColor="#ffffff"
                fgColor="#0f172a"
                marginSize={0}
                style={{ width: "100%", height: "100%" }}
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleNext}
          aria-label="下一张推广海报"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-orange-200/80 bg-white/90 text-slate-600 shadow-xs transition hover:border-primary/40 hover:bg-orange-50 hover:text-primary"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* 4 Theme Tabs */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
        {PROMOTION_POSTERS.map((item, idx) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveIndex(idx)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium transition-all",
              idx === activeIndex
                ? "bg-primary text-white shadow-xs"
                : "border border-orange-100 bg-white/90 text-slate-600 hover:border-primary/35 hover:text-primary"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Download CTA */}
      <button
        type="button"
        onClick={() => void handleDownloadPoster()}
        disabled={downloading}
        className="mt-3 inline-flex h-9 w-full max-w-[228px] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#ea580c] to-[#f97316] px-4 text-xs font-semibold text-white shadow-sm transition hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
      >
        {downloading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>正在合成高清海报...</span>
          </>
        ) : (
          <>
            <Download className="h-3.5 w-3.5" />
            <span>下载专属二维码海报</span>
          </>
        )}
      </button>
    </div>
  );
}
