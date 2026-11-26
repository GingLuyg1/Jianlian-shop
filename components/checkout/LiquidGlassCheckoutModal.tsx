"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { createPortal } from "react-dom";
import { ExternalLink, Lock, X } from "lucide-react";
import { toast } from "sonner";

import { CheckoutModalProvider } from "./CheckoutModalContext";
import { checkoutHref } from "@/lib/products/checkout-navigation";
import { cn } from "@/lib/utils";
import styles from "./LiquidGlassCheckoutModal.module.css";

const CheckoutExperience = dynamic(() => import("@/app/checkout/page"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full min-h-[380px] grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_350px]">
      <div className="rounded-2xl border border-white/80 bg-white/75 p-6 shadow-xs">
        <div className="h-6 w-44 animate-pulse rounded-lg bg-orange-100/80" />
        <div className="mt-5 grid gap-5 sm:grid-cols-[190px_minmax(0,1fr)]">
          <div className="aspect-square w-full animate-pulse rounded-2xl bg-slate-100" />
          <div className="space-y-3">
            <div className="h-6 w-3/4 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-4 w-full animate-pulse rounded-md bg-slate-100" />
            <div className="h-4 w-2/3 animate-pulse rounded-md bg-slate-100" />
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-white/80 bg-white/80 p-5 shadow-xs space-y-4">
        <div className="h-5 w-28 animate-pulse rounded-md bg-slate-100" />
        <div className="h-11 w-full animate-pulse rounded-xl bg-slate-100" />
        <div className="h-11 w-full animate-pulse rounded-xl bg-slate-100" />
        <div className="h-12 w-full animate-pulse rounded-xl bg-orange-100/80" />
      </div>
    </div>
  ),
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
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!productId) {
      setClosing(false);
      setBackdropLocked(false);
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
        toast.info("正在处理订单或存在待支付订单，如需退出请点击右上角关闭按钮。");
        return;
      }
      setClosing(true);
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        setClosing(false);
        setBackdropLocked(false);
        onClose();
      }, 175);
    },
    [backdropLocked, closing, onClose, productId]
  );

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

  const standaloneHref = useMemo(
    () => (productId ? checkoutHref(productId, returnTo || "") : "/checkout"),
    [productId, returnTo]
  );

  const contextValue = useMemo(
    () =>
      productId
        ? {
            isModal: true,
            productId,
            returnTo,
            onClose: () => requestClose(true),
            onLockBackdropChange: setBackdropLocked,
          }
        : null,
    [productId, requestClose, returnTo]
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
        aria-label="快速选购与下单"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.dragHandle} aria-hidden="true" />
        <div className={styles.specularBar}>
          <span className={styles.hintPill}>
            {backdropLocked ? (
              <>
                <Lock className="h-3 w-3 text-amber-600" />
                <span>订单处理中 · 已防误触锁定背景</span>
              </>
            ) : (
              <>
                <span className={styles.hintDot} />
                <span>点击空白处或按 ESC 即可秒回商品列表，无需重新加载</span>
              </>
            )}
          </span>

          <div className="flex items-center gap-2">
            <Link
              href={standaloneHref}
              className={cn(styles.glassActionBtn, "hidden sm:inline-flex")}
              title="在完整页面打开"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>独立页面</span>
            </Link>
            <button
              type="button"
              onClick={() => requestClose(true)}
              className={styles.closeCircle}
              aria-label="关闭下单弹窗"
              title="关闭并返回分类"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

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
