"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ImageIcon,
  Loader2,
  MousePointerClick,
  RefreshCw,
  ZoomIn,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PROMOTION_POSTERS, type PromotionPosterSpec } from "@/lib/promotion";
import { cn } from "@/lib/utils";

type PromotionPosterCarouselProps = {
  inviteUrl: string;
  inviteCode: string;
  isPersonalized?: boolean;
};

type CompositedPosterAsset = {
  dataUrl: string;
  blob: Blob | null;
  urlKey: string;
};

const baseImageCache = new Map<string, Promise<HTMLImageElement>>();

function loadPosterBaseImage(src: string): Promise<HTMLImageElement> {
  const cached = baseImageCache.get(src);
  if (cached) return cached;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => {
      baseImageCache.delete(src);
      reject(new Error("海报底图加载失败"));
    };
    img.src = src;
  });

  baseImageCache.set(src, promise);
  return promise;
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

async function composePosterWithQr(
  poster: PromotionPosterSpec,
  qrCanvas: HTMLCanvasElement,
  urlKey: string
): Promise<CompositedPosterAsset> {
  const img = await loadPosterBaseImage(poster.src);

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || poster.width;
  canvas.height = img.naturalHeight || poster.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("当前浏览器不支持海报合成");
  }

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // Compute exact centered square QR placement strictly inside the poster's reserved white slot
  const slotX = poster.qrSlot.x * canvas.width;
  const slotY = poster.qrSlot.y * canvas.height;
  const slotW = poster.qrSlot.w * canvas.width;
  const slotH = poster.qrSlot.h * canvas.height;
  const padRatio = poster.qrSlot.paddingPct ?? 0.04;
  const innerSize = Math.round(Math.min(slotW, slotH) * (1 - padRatio * 2));
  const drawX = Math.round(slotX + (slotW - innerSize) / 2);
  const drawY = Math.round(slotY + (slotH - innerSize) / 2);
  const radius = Math.round(innerSize * (poster.qrSlot.borderRadiusPct ?? 0.03));

  ctx.save();
  drawRoundedRectPath(ctx, drawX, drawY, innerSize, innerSize, radius);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrCanvas, drawX, drawY, innerSize, innerSize);
  ctx.restore();

  const dataUrl = canvas.toDataURL("image/png");
  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob((result) => resolve(result), "image/png");
    } catch {
      resolve(null);
    }
  });

  return { dataUrl, blob, urlKey };
}

export default function PromotionPosterCarousel({
  inviteUrl,
  inviteCode,
  isPersonalized,
}: PromotionPosterCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [compositedMap, setCompositedMap] = useState<Record<string, CompositedPosterAsset>>({});
  const [composeError, setComposeError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [copyingImage, setCopyingImage] = useState(false);
  const [copiedPosterId, setCopiedPosterId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const qrHiddenContainerRef = useRef<HTMLDivElement | null>(null);
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  const poster: PromotionPosterSpec = PROMOTION_POSTERS[activeIndex] ?? PROMOTION_POSTERS[0];
  const effectiveUrl = inviteUrl || "https://www.jianlian.shop/register";
  const personalized = isPersonalized ?? Boolean(inviteCode);

  const activeEntry = compositedMap[poster.id];
  const activeComposited = activeEntry?.urlKey === effectiveUrl ? activeEntry : null;

  const handlePrev = useCallback(() => {
    setActiveIndex((prev) => (prev - 1 + PROMOTION_POSTERS.length) % PROMOTION_POSTERS.length);
  }, []);

  const handleNext = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % PROMOTION_POSTERS.length);
  }, []);

  // Pre-composite the active poster first, then warm all 4 posters into real PNG images
  // with the QR code baked directly into the bitmap so native right-click Copy/Save works.
  useEffect(() => {
    let cancelled = false;
    let rafId = 0;
    setComposeError(null);

    const runCompositeBatch = async () => {
      const qrCanvas = qrHiddenContainerRef.current?.querySelector("canvas");
      if (!qrCanvas) {
        if (!cancelled) {
          setComposeError("二维码画布尚未就绪，请点击重试");
        }
        return;
      }

      const startIdx = activeIndexRef.current;
      const prioritized = [
        PROMOTION_POSTERS[startIdx] ?? PROMOTION_POSTERS[0],
        ...PROMOTION_POSTERS.filter((_, idx) => idx !== startIdx),
      ];

      for (const item of prioritized) {
        if (cancelled) return;
        try {
          const latestQrCanvas = qrHiddenContainerRef.current?.querySelector("canvas") ?? qrCanvas;
          const result = await composePosterWithQr(item, latestQrCanvas, effectiveUrl);
          if (cancelled) return;
          setCompositedMap((prev) => ({
            ...prev,
            [item.id]: result,
          }));
        } catch (err) {
          if (cancelled) return;
          if (item.id === (PROMOTION_POSTERS[activeIndexRef.current]?.id ?? PROMOTION_POSTERS[0].id)) {
            setComposeError(err instanceof Error ? err.message : "海报合成失败，请稍后重试");
          }
        }
      }
    };

    rafId = window.requestAnimationFrame(() => {
      void runCompositeBatch();
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [effectiveUrl, retryTick]);

  // Keyboard navigation while lightbox dialog is open
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        handlePrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        handleNext();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleNext, handlePrev, lightboxOpen]);

  const ensureActiveAsset = useCallback(async (): Promise<CompositedPosterAsset> => {
    if (activeComposited) return activeComposited;
    const qrCanvas = qrHiddenContainerRef.current?.querySelector("canvas");
    if (!qrCanvas) {
      throw new Error("二维码尚未生成，请稍后重试");
    }
    const fresh = await composePosterWithQr(poster, qrCanvas, effectiveUrl);
    setCompositedMap((prev) => ({ ...prev, [poster.id]: fresh }));
    return fresh;
  }, [activeComposited, effectiveUrl, poster]);

  const handleCopyPosterImage = useCallback(async () => {
    if (copyingImage) return;
    setCopyingImage(true);
    try {
      const canUseClipboardImage =
        typeof window !== "undefined" &&
        typeof ClipboardItem !== "undefined" &&
        Boolean(navigator.clipboard?.write);

      if (!canUseClipboardImage) {
        toast.info("当前浏览器不支持按钮一键复制图片，请直接右键海报选择「复制图片」");
        return;
      }

      const asset = await ensureActiveAsset();
      let blob = asset.blob;
      if (!blob) {
        const res = await fetch(asset.dataUrl);
        blob = await res.blob();
      }

      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": blob,
        }),
      ]);

      setCopiedPosterId(poster.id);
      toast.success(`已复制「${poster.label}」含二维码高清海报，可直接粘贴到微信 / QQ / Telegram`);
      window.setTimeout(() => {
        setCopiedPosterId((curr) => (curr === poster.id ? null : curr));
      }, 2200);
    } catch {
      toast.info("浏览器拦截了剪贴板图片写入，请直接右键海报选择「复制图片」或点击下载");
    } finally {
      setCopyingImage(false);
    }
  }, [copyingImage, ensureActiveAsset, poster.id, poster.label]);

  const handleDownloadPoster = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const asset = await ensureActiveAsset();
      const link = document.createElement("a");
      link.download = `jianlian-promotion-${poster.id}-${inviteCode || "share"}.png`;
      link.href = asset.dataUrl;
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(`已下载「${poster.label}」专属二维码海报`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "海报合成下载失败，请稍后重试");
    } finally {
      setDownloading(false);
    }
  }, [downloading, ensureActiveAsset, inviteCode, poster.id, poster.label]);

  return (
    <div className="flex flex-col">
      {/* Hidden high-resolution QR canvas baked directly into every composited poster PNG */}
      <div ref={qrHiddenContainerRef} className="sr-only" aria-hidden="true">
        <QRCodeCanvas
          key={effectiveUrl}
          value={effectiveUrl}
          size={512}
          level="M"
          bgColor="#ffffff"
          fgColor="#0f172a"
          marginSize={1}
        />
      </div>

      {/* Studio Header Bar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-orange-100/80 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-100/80 text-primary">
            <ImageIcon className="h-4 w-4" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-950">专属二维码海报</h2>
              <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary ring-1 ring-inset ring-orange-200/80">
                {activeIndex + 1} / {PROMOTION_POSTERS.length} · {poster.label}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              768×1024 原图实时合成二维码，支持右键直接复制或另存
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {activeComposited ? (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset",
                personalized
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200/80"
                  : "bg-amber-50 text-amber-700 ring-amber-200/80"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  personalized ? "bg-emerald-500" : "bg-amber-500"
                )}
              />
              {personalized ? "已嵌入专属码" : "示例预览"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-medium text-primary ring-1 ring-inset ring-orange-200/80">
              <Loader2 className="h-3 w-3 animate-spin" />
              合成中...
            </span>
          )}

          {/* Compact mobile prev/next buttons so poster keeps maximum horizontal width on small screens */}
          <div className="flex items-center gap-1 sm:hidden">
            <button
              type="button"
              onClick={handlePrev}
              aria-label="上一张推广海报"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-orange-200/80 bg-white text-slate-600 transition hover:border-primary/40 hover:text-primary"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              aria-label="下一张推广海报"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-orange-200/80 bg-white text-slate-600 transition hover:border-primary/40 hover:text-primary"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Flagship Enlarged Poster Preview Stage */}
      <div className="relative flex flex-col items-center justify-center rounded-2xl border border-orange-100/90 bg-[radial-gradient(circle_at_top,_rgba(255,237,213,0.52),_rgba(255,255,255,0.92)_68%)] px-2 py-3.5 sm:px-3 sm:py-4">
        <div className="flex w-full items-center justify-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={handlePrev}
            aria-label="上一张推广海报"
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-orange-200/85 bg-white/95 text-slate-600 shadow-xs transition hover:border-primary/45 hover:bg-orange-50 hover:text-primary active:scale-95 sm:flex"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div
            data-testid="promotion-poster-preview"
            className="relative aspect-[3/4] w-full max-w-[336px] overflow-hidden rounded-2xl bg-white shadow-[0_20px_44px_-22px_rgba(120,62,20,0.36)] ring-1 ring-slate-900/10 sm:max-w-[388px] xl:max-w-[404px] 2xl:max-w-[436px]"
          >
            {activeComposited ? (
              <img
                data-testid="promotion-poster-image"
                data-composited="true"
                data-poster-id={poster.id}
                src={activeComposited.dataUrl}
                alt={`简联商城专属推广海报 - ${poster.label}${inviteCode ? ` (${inviteCode})` : ""}`}
                onClick={() => setLightboxOpen(true)}
                title="点击放大查看；右键可直接「复制图片」或「图片另存为」（已包含专属二维码）"
                className="block h-full w-full cursor-zoom-in object-contain transition-transform duration-300 hover:scale-[1.008]"
              />
            ) : composeError ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-orange-50/40 px-6 text-center">
                <p className="text-xs font-medium text-slate-600">{composeError}</p>
                <button
                  type="button"
                  onClick={() => setRetryTick((v) => v + 1)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-primary shadow-2xs transition hover:bg-orange-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  重新合成海报
                </button>
              </div>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2.5 bg-gradient-to-b from-orange-50/50 to-white text-slate-500">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-xs font-medium">正在合成专属二维码海报...</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleNext}
            aria-label="下一张推广海报"
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-orange-200/85 bg-white/95 text-slate-600 shadow-xs transition hover:border-primary/45 hover:bg-orange-50 hover:text-primary active:scale-95 sm:flex"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Right-click / long-press native hint bar */}
        <div className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-500">
          <MousePointerClick className="h-3.5 w-3.5 shrink-0 text-primary/80" />
          <span className="hidden sm:inline">
            右键海报可直接「复制图片 / 另存为」（已连带二维码），点击图片可全屏放大
          </span>
          <span className="sm:hidden">
            长按海报可直接保存完整二维码图片，点击图片可放大查看
          </span>
        </div>
      </div>

      {/* 4-Poster Visual Thumbnail Filmstrip */}
      <div className="mt-3.5 grid grid-cols-4 gap-2.5">
        {PROMOTION_POSTERS.map((item, idx) => {
          const isActive = idx === activeIndex;
          const thumbEntry = compositedMap[item.id];
          const thumbSrc = thumbEntry?.urlKey === effectiveUrl ? thumbEntry.dataUrl : item.src;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveIndex(idx)}
              aria-pressed={isActive}
              data-testid={`promotion-poster-thumb-${item.id}`}
              className={cn(
                "group flex flex-col items-center rounded-xl border p-1.5 transition-all",
                isActive
                  ? "border-primary bg-orange-50/80 shadow-xs ring-2 ring-primary/20"
                  : "border-orange-100/90 bg-white/85 hover:border-primary/40 hover:bg-orange-50/35"
              )}
            >
              <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-slate-100 ring-1 ring-black/5">
                <img
                  src={thumbSrc}
                  alt={item.label}
                  className={cn(
                    "h-full w-full object-cover transition-transform duration-200",
                    isActive ? "scale-[1.01]" : "opacity-90 group-hover:scale-[1.03] group-hover:opacity-100"
                  )}
                />
              </div>
              <span
                className={cn(
                  "mt-1.5 w-full truncate text-center text-[11px] font-semibold",
                  isActive ? "text-primary" : "text-slate-600 group-hover:text-slate-900"
                )}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Studio Action Bar: One-click Copy Image / Download HD / Fullscreen Zoom */}
      <div className="mt-3.5 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <button
          type="button"
          data-testid="promotion-poster-copy-btn"
          onClick={() => void handleCopyPosterImage()}
          disabled={copyingImage || !activeComposited}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#ea580c] to-[#f97316] px-4 text-xs font-semibold text-white shadow-sm transition hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
        >
          {copyingImage ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>正在复制图片...</span>
            </>
          ) : copiedPosterId === poster.id ? (
            <>
              <Check className="h-3.5 w-3.5" />
              <span>已复制含码海报</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>一键复制海报</span>
            </>
          )}
        </button>

        <button
          type="button"
          data-testid="promotion-poster-download-btn"
          onClick={() => void handleDownloadPoster()}
          disabled={downloading || !activeComposited}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-orange-200 bg-white px-4 text-xs font-semibold text-slate-800 shadow-2xs transition hover:border-primary/45 hover:bg-orange-50/70 hover:text-primary active:scale-[0.98] disabled:opacity-60"
        >
          {downloading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>正在导出原图...</span>
            </>
          ) : (
            <>
              <Download className="h-3.5 w-3.5" />
              <span>下载高清原图</span>
            </>
          )}
        </button>

        <button
          type="button"
          data-testid="promotion-poster-zoom-btn"
          onClick={() => setLightboxOpen(true)}
          disabled={!activeComposited}
          aria-label="查看大图"
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-orange-200/80 bg-orange-50/60 px-3.5 text-xs font-semibold text-primary transition hover:border-primary/45 hover:bg-orange-100/70 active:scale-[0.98] disabled:opacity-60"
        >
          <ZoomIn className="h-3.5 w-3.5" />
          <span>大图</span>
        </button>
      </div>

      {/* Fullscreen High-Res Poster Lightbox Dialog */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-3xl rounded-2xl border-orange-100 bg-[#fffdf9] p-4 sm:p-5">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-base font-bold text-slate-950">
              <span>{poster.label} · 高清二维码海报</span>
              <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary ring-1 ring-inset ring-orange-200/80">
                {activeIndex + 1} / {PROMOTION_POSTERS.length}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              完整 768×1024 合成原图，可直接右键图片「复制图片 / 图片另存为」，或使用下方快捷操作。
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={handlePrev}
              aria-label="查看上一张海报"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-orange-200 bg-white text-slate-600 shadow-xs transition hover:border-primary/45 hover:bg-orange-50 hover:text-primary"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="flex max-h-[78vh] flex-1 items-center justify-center overflow-hidden rounded-2xl border border-orange-100 bg-orange-50/35 p-2 sm:p-3">
              {activeComposited ? (
                <img
                  data-testid="promotion-poster-lightbox-image"
                  data-composited="true"
                  src={activeComposited.dataUrl}
                  alt={`简联商城高清推广海报 - ${poster.label}`}
                  className="max-h-[74vh] w-auto max-w-full rounded-xl object-contain shadow-lg"
                />
              ) : (
                <div className="flex h-80 items-center justify-center text-xs text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />
                  正在合成高清海报...
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleNext}
              aria-label="查看下一张海报"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-orange-200 bg-white text-slate-600 shadow-xs transition hover:border-primary/45 hover:bg-orange-50 hover:text-primary"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-orange-100/80 pt-3">
            <div className="flex items-center gap-1.5">
              {PROMOTION_POSTERS.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveIndex(idx)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-semibold transition",
                    idx === activeIndex
                      ? "bg-primary text-white shadow-2xs"
                      : "border border-orange-100 bg-white text-slate-600 hover:border-primary/35 hover:text-primary"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopyPosterImage()}
                disabled={copyingImage || !activeComposited}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#ea580c] to-[#f97316] px-3.5 text-xs font-semibold text-white shadow-xs transition hover:brightness-105 disabled:opacity-60"
              >
                {copiedPosterId === poster.id ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>已复制海报</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>复制海报图片</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadPoster()}
                disabled={downloading || !activeComposited}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-orange-200 bg-white px-3.5 text-xs font-semibold text-slate-800 transition hover:border-primary/45 hover:bg-orange-50 hover:text-primary disabled:opacity-60"
              >
                <Download className="h-3.5 w-3.5" />
                <span>下载原图</span>
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
