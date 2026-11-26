"use client";

import { useRef, type RefObject } from "react";
import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";
import styles from "./SecondarySlidingIndicator.module.css";

function measureRelativeToContainer(button: HTMLElement, container: HTMLElement) {
  let left = 0;
  let top = 0;
  let node: HTMLElement | null = button;
  while (node && node !== container) {
    left += node.offsetLeft;
    top += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  if (node === container && button.offsetWidth > 0 && button.offsetHeight > 0) {
    return {
      left,
      top,
      width: button.offsetWidth,
      height: button.offsetHeight,
    };
  }
  const box = button.getBoundingClientRect();
  const rail = container.getBoundingClientRect();
  return {
    left: box.left - rail.left + container.scrollLeft - container.clientLeft,
    top: box.top - rail.top + container.scrollTop - container.clientTop,
    width: box.width,
    height: box.height,
  };
}

/** Geometry-only feedback. Never changes selection, fetching or wheel transforms. */
export default function SecondarySlidingIndicator({ containerRef, activeId, ready, layoutKey }: {
  containerRef: RefObject<HTMLDivElement | null>;
  activeId: string;
  ready: boolean;
  layoutKey: string;
}) {
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const committedId = useRef("");
  useIsomorphicLayoutEffect(() => {
    const indicator = indicatorRef.current;
    if (!indicator) return;
    // Resolve container via DOM fallback too: on initial mount, React runs child
    // useLayoutEffect before attaching the parent's ref, so containerRef.current
    // can still be null during the first layout pass.
    const container =
      containerRef.current ??
      indicator.closest<HTMLElement>('[data-wheel-container="secondary"]') ??
      indicator.parentElement;
    if (!container) return;
    if (activeId) {
      committedId.current = activeId;
    } else if (ready) {
      committedId.current = "";
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const targetId = committedId.current || activeId;
      const item = targetId
        ? Array.from(container.querySelectorAll<HTMLElement>("[data-wheel-item]"))
            .find((row) => row.dataset.wheelItem === targetId)
        : undefined;
      const button = item?.querySelector<HTMLElement>("button");
      if (!button || !container.clientWidth) {
        indicator.dataset.visible = "false";
        return;
      }
      const { left, top, width, height } = measureRelativeToContainer(button, container);
      if (width <= 0 || height <= 0) {
        indicator.dataset.visible = "false";
        return;
      }
      // Absolute child of the existing scroll rail: scrolls with the cards and
      // cannot add height, spacer rows or override the shared wheel transforms.
      indicator.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      indicator.style.width = `${width}px`;
      indicator.style.height = `${height}px`;
      if (indicator.dataset.ready !== "true") {
        indicator.getBoundingClientRect();
        indicator.dataset.ready = "true";
      }
      indicator.dataset.visible = "true";
      indicator.dataset.activeId = targetId;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    const settleFrame = requestAnimationFrame(update);
    // Re-sync after sibling accordion sub-directory transitions (380ms) complete
    // so collapsing an upper category tree never leaves the indicator shifted.
    const settleTimerMid = window.setTimeout(schedule, 220);
    const settleTimerEnd = window.setTimeout(schedule, 430);

    const resize = new ResizeObserver(schedule);
    const observeItems = () => {
      resize.disconnect();
      resize.observe(container);
      container.querySelectorAll<HTMLElement>("[data-wheel-item]").forEach((row) => {
        resize.observe(row);
      });
    };
    observeItems();

    const mutations = new MutationObserver((records) => {
      if (records.some((record) => record.target !== indicator)) {
        if (records.some((record) => record.type === "childList")) {
          observeItems();
        }
        schedule();
      }
    });
    mutations.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class", "aria-hidden"] });
    const onTransition = (event: Event) => {
      if (event.target !== indicator) schedule();
    };
    container.addEventListener("transitionrun", onTransition, true);
    container.addEventListener("transitionend", onTransition, true);
    return () => {
      resize.disconnect();
      mutations.disconnect();
      container.removeEventListener("transitionrun", onTransition, true);
      container.removeEventListener("transitionend", onTransition, true);
      window.clearTimeout(settleTimerMid);
      window.clearTimeout(settleTimerEnd);
      cancelAnimationFrame(frame);
      cancelAnimationFrame(settleFrame);
    };
  }, [activeId, ready, layoutKey, containerRef]);

  return <span ref={indicatorRef} data-testid="secondary-nav-indicator" aria-hidden="true" className={styles.indicator} />;
}
