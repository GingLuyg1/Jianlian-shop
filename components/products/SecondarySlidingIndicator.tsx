"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import styles from "./SecondarySlidingIndicator.module.css";

/** Geometry-only feedback. Never changes selection, fetching or wheel transforms. */
export default function SecondarySlidingIndicator({ containerRef, activeId, ready, layoutKey }: {
  containerRef: RefObject<HTMLDivElement | null>;
  activeId: string;
  ready: boolean;
  layoutKey: string;
}) {
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const committedId = useRef("");
  useLayoutEffect(() => {
    const container = containerRef.current;
    const indicator = indicatorRef.current;
    if (!container || !indicator) return;
    if (ready) committedId.current = activeId;
    let frame = 0;
    const update = () => {
      frame = 0;
      const item = Array.from(container.querySelectorAll<HTMLElement>("[data-wheel-item]"))
        .find((row) => row.dataset.wheelItem === committedId.current);
      const button = item?.querySelector("button");
      if (!button || !container.clientWidth) {
        indicator.dataset.visible = "false";
        return;
      }
      const box = button.getBoundingClientRect();
      const rail = container.getBoundingClientRect();
      const left = box.left - rail.left + container.scrollLeft - container.clientLeft;
      const top = box.top - rail.top + container.scrollTop - container.clientTop;
      // Absolute child of the existing scroll rail: scrolls with the cards and
      // cannot add height, spacer rows or override the shared 98% transform.
      indicator.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      indicator.style.width = `${box.width}px`;
      indicator.style.height = `${box.height}px`;
      if (indicator.dataset.ready !== "true") {
        indicator.getBoundingClientRect();
        indicator.dataset.ready = "true";
      }
      indicator.dataset.visible = "true";
      indicator.dataset.activeId = committedId.current;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    const resize = new ResizeObserver(schedule);
    resize.observe(container);
    const mutations = new MutationObserver((records) => {
      if (records.some((record) => record.target !== indicator)) schedule();
    });
    mutations.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class"] });
    container.addEventListener("scroll", schedule, { passive: true });
    return () => {
      resize.disconnect();
      mutations.disconnect();
      container.removeEventListener("scroll", schedule);
      cancelAnimationFrame(frame);
    };
  }, [activeId, ready, layoutKey, containerRef]);

  return <span ref={indicatorRef} data-testid="secondary-nav-indicator" aria-hidden="true" className={styles.indicator} />;
}
