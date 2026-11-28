"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { CheckoutModalProvider } from "./CheckoutModalContext";
import OptionLoadingSpinner from "@/components/ui/OptionLoadingSpinner";
import { cn } from "@/lib/utils";
import styles from "./LiquidGlassCheckoutModal.module.css";

async function copyShareText(value: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function ModalCheckoutSkeleton() {
  return (
    <div
      data-testid="liquid-glass-checkout-loading"
      className={cn(
        "flex h-full min-h-[380px] w-full items-center justify-center p-4",
        styles.loadingBoxEnter
      )}
    >
      <div className="flex w-full max-w-[340px] flex-col items-center rounded-[24px] border border-orange-200/70 bg-white/85 px-7 py-8 text-center shadow-[0_20px_50px_-24px_rgba(169,103,52,0.28)] backdrop-blur-xl">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-200/70 bg-gradient-to-br from-orange-50 via-amber-50/70 to-white shadow-inner">
          <OptionLoadingSpinner active size="lg" />
        </div>
        <div className="mt-4 text-sm font-bold tracking-tight text-slate-900">
          正在加载商品详情
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
          正在同步实时规格、库存与官方说明，请稍候…
        </p>
        <div className="mt-4 flex w-full items-center gap-2">
          <div className="h-1.5 flex-1 animate-pulse rounded-full bg-orange-100/90" />
          <div className="h-1.5 w-12 animate-pulse rounded-full bg-orange-200/75" />
        </div>
      </div>
    </div>
  );
}

const CheckoutExperience = dynamic(() => import("@/app/checkout/page"), {
  ssr: false,
  loading: () => <ModalCheckoutSkeleton />,
});

export interface LiquidGlassCheckoutModalProps {
  productId: string | null;
  returnTo?: string;
  onClose: () => void;
}

export default function LiquidGlassCheckoutModal({
  productId,
  returnTo,
  onClose,
}: LiquidGlassCheckoutModalProps) {
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [backdropLocked, setBackdropLocked] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const shareTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      if (shareTimerRef.current !== null) window.clearTimeout(shareTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!productId) {
      setClosing(false);
      setBackdropLocked(false);
      setShareCopied(false);
      return;
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [productId]);

  const requestClose = useCallback(
    (force = false) => {
      if (!productId || closing) return;
      if (backdropLocked && !force) {
        toast.info(
          <div className="leading-relaxed">
            <div>正在处理订单或存在待支付订单；</div>
            <div>如需退出请点击右上角关闭按钮。</div>
          </div>
        );
        return;
      }
      setClosing(true);
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        setClosing(false);
        setBackdropLocked(false);
        onClose();
      }, 155);
    },
    [backdropLocked, closing, onClose, productId]
  );

  const handleShare = useCallback(async () => {
    if (!productId || typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("p", productId);
      const copied = await copyShareText(url.toString());
      if (copied) {
        setShareCopied(true);
        if (shareTimerRef.current !== null) window.clearTimeout(shareTimerRef.current);
        shareTimerRef.current = window.setTimeout(() => {
          shareTimerRef.current = null;
          setShareCopied(false);
        }, 2200);
        toast.success("已复制分享链接，打开即可直达当前分类与商品弹窗");
      } else {
        toast.error("复制失败，请手动复制浏览器地址栏链接");
      }
    } catch {
      toast.error("生成分享链接失败，请稍后重试");
    }
  }, [productId]);

  useEffect(() => {
    if (!productId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Ignore ESC if a nested Radix dialog (e.g. terms / payment dialog) is open
        const nestedDialog = document.querySelector('[role="dialog"][data-state="open"]');
        if (nestedDialog) return;
        requestClose(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [productId, requestClose]);

  const contextValue = useMemo(
    () =>
      productId
        ? {
            isModal: true,
            productId,
            returnTo,
            backdropLocked,
            shareCopied,
            onShare: () => void handleShare(),
            onClose: () => requestClose(true),
            onLockBackdropChange: setBackdropLocked,
          }
        : null,
    [backdropLocked, handleShare, productId, requestClose, returnTo, shareCopied]
  );

  if (!mounted || !productId || !contextValue) return null;

  return createPortal(
    <div
      data-testid="liquid-glass-checkout-backdrop"
      className={cn(styles.backdrop, closing && styles.backdropClosing)}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          requestClose(false);
        }
      }}
      role="presentation"
    >
      <div
        data-testid="liquid-glass-checkout-modal"
        className={cn(styles.shell, closing && styles.shellClosing)}
        role="dialog"
        aria-modal="true"
        aria-label="商品选购与下单"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.dragHandle} aria-hidden="true" />
        <div className={cn(styles.body, "sidebar-scroll")}>
          <CheckoutModalProvider value={contextValue}>
            <CheckoutExperience key={productId} />
          </CheckoutModalProvider>
        </div>
      </div>
    </div>,
    document.body
  );
}
