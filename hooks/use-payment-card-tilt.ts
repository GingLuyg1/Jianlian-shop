"use client";

import { useCallback, useEffect, useRef, type FocusEvent, type PointerEvent } from "react";
import { paymentCardTilt } from "@/lib/motion/payment-card-tilt";

export function usePaymentCardTilt() {
  const frame = useRef(0);
  const allowed = useRef(false);
  const pending = useRef<{ node: HTMLButtonElement; x: number; y: number } | null>(null);
  const active = useRef<HTMLButtonElement | null>(null);
  const reset = useCallback((node: HTMLButtonElement | null) => {
    if (!node) return;
    if (pending.current?.node === node) { cancelAnimationFrame(frame.current); frame.current = 0; pending.current = null; }
    for (const name of ["--tilt-x", "--tilt-y", "--glare-x", "--glare-y"]) node.style.removeProperty(name);
    delete node.dataset.tilting;
    if (active.current === node) active.current = null;
  }, []);

  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => { allowed.current = pointer.matches && !reduce.matches; if (!allowed.current) reset(active.current); };
    update(); reduce.addEventListener("change", update); pointer.addEventListener("change", update);
    return () => { reduce.removeEventListener("change", update); pointer.removeEventListener("change", update); reset(active.current); cancelAnimationFrame(frame.current); };
  }, [reset]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const node = event.currentTarget;
    if (!allowed.current || event.pointerType !== "mouse" || node.disabled) return;
    if (active.current && active.current !== node) reset(active.current);
    active.current = node;
    pending.current = { node, x: event.clientX, y: event.clientY };
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const value = pending.current; pending.current = null;
      if (!value || !value.node.isConnected || value.node.disabled || !allowed.current) return;
      // Measure the stationary grid slot, never the tilted button's rectangle.
      const bounds = value.node.parentElement!.getBoundingClientRect();
      const tilt = paymentCardTilt(value.x - bounds.left, value.y - bounds.top, bounds.width, bounds.height);
      value.node.style.setProperty("--tilt-x", `${tilt.rotateX.toFixed(2)}deg`);
      value.node.style.setProperty("--tilt-y", `${tilt.rotateY.toFixed(2)}deg`);
      value.node.style.setProperty("--glare-x", `${tilt.glareX.toFixed(1)}%`);
      value.node.style.setProperty("--glare-y", `${tilt.glareY.toFixed(1)}%`);
      value.node.dataset.tilting = "true";
    });
  }, [reset]);

  const onPointerLeave = useCallback((event: PointerEvent<HTMLButtonElement>) => reset(event.currentTarget), [reset]);
  const onBlur = useCallback((event: FocusEvent<HTMLButtonElement>) => reset(event.currentTarget), [reset]);
  return { onPointerMove, onPointerLeave, onPointerCancel: onPointerLeave, onBlur };
}
