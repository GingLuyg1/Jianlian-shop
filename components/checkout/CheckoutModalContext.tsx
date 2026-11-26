"use client";

import { createContext, useContext } from "react";

export type CheckoutModalContextValue = {
  isModal: boolean;
  productId: string;
  returnTo?: string;
  backdropLocked?: boolean;
  shareCopied?: boolean;
  onShare?: () => void;
  onClose: () => void;
  onLockBackdropChange?: (locked: boolean) => void;
};

const CheckoutModalContext = createContext<CheckoutModalContextValue | null>(null);

export const CheckoutModalProvider = CheckoutModalContext.Provider;

export function useCheckoutModal() {
  return useContext(CheckoutModalContext);
}
