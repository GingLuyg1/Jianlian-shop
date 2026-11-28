"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { CheckoutModalProvider } from "./CheckoutModalContext";
import RefinedLoadingOrb from "@/components/ui/RefinedLoadingOrb";
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
        "relative grid h-full min-h-[380px] w-full grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1fr)_clamp(320px,calc(28%-20px),372px)] lg:gap-4",
        styles.loadingBoxEnter
      )}
    >
      <div className="h-full min-h-[320px] rounded-[18px] bg-white/55" aria-hidden="true" />
      <div className="hidden h-full rounded-[26px] border border-white/80 bg-white/70 lg:block" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <RefinedLoadingOrb label="正在加载商品详情" />
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
