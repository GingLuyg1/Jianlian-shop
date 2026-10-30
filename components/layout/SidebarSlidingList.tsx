"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { getCatalogRoutePending, subscribeCatalogRoutePending } from "@/lib/motion/catalog-route-exit";
import styles from "./SidebarSlidingList.module.css";

type Position = { top: number; left: number; width: number; height: number };
// Only public navigation geometry; carry the rendered position across page
// shell remounts so a fast route commit does not restart the highlight at zero.
let lastSnapshot: { position: Position; href: string } | null = null;

export default function SidebarSlidingList({ activeKey, layoutKey, children }: { activeKey: string; layoutKey: string; children: ReactNode }) {
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  function place(link: HTMLElement) {
    const list = listRef.current;
    const indicator = indicatorRef.current;
    if (!list || !indicator || list.getBoundingClientRect().width === 0) return;
    const item = link.getBoundingClientRect();
    const box = list.getBoundingClientRect();
    const target = { top: item.top - box.top, left: item.left - box.left, width: item.width, height: item.height };
    const apply = (position: Position) => {
      indicator.style.transform = `translate3d(${position.left}px, ${position.top}px, 0)`;
      indicator.style.width = `${position.width}px`;
      indicator.style.height = `${position.height}px`;
    };
    if (indicator.dataset.ready !== "true") {
      apply(lastSnapshot?.position ?? target);
      indicator.getBoundingClientRect();
      indicator.dataset.ready = "true";
    }
    apply(target);
    indicator.dataset.visible = "true";
    indicator.dataset.currentHref = link.dataset.sidebarLink;
    list.querySelectorAll<HTMLElement>("[data-sidebar-link]").forEach((item) => {
      if (item === link) item.dataset.sidebarCurrent = "true";
      else delete item.dataset.sidebarCurrent;
    });
  }
  useLayoutEffect(() => {
    const list = listRef.current;
    const indicator = indicatorRef.current;
    if (!list || !indicator) return;
    const readyHref = () => {
      const pending = getCatalogRoutePending();
      const destination = pending?.target.split(/[?#]/)[0] ?? activeKey;
      if (/^\/products\/(sim-cards|gift-cards|digital-accounts|ai-membership|sms-code)$/.test(destination)) {
        const main = list.closest("aside")?.parentElement?.querySelector("main");
        const rail = main?.querySelector<HTMLElement>('[data-testid="storefront-secondary-categories"]');
        // Navigation confirms the verified secondary rail, independently of
        // product loading. Never accept an intermediate/superseded route.
        return rail?.dataset.catalogSecondaryRoute === destination && rail.dataset.catalogSecondaryReady === "true" ? destination : null;
      }
      if (window.location.pathname !== activeKey || destination !== activeKey) return null;
      const heading = document.querySelector("main h1")?.textContent?.trim();
      if (activeKey === "/tutorials") return heading === "购买与交付指南" ? activeKey : null;
      if (activeKey === "/faq") return heading === "购买、交付、售后问题集中说明" ? activeKey : null;
      return document.querySelector("main") && !document.querySelector("main .next-error-h1") ? activeKey : null;
    };
    const update = () => {
      const links = Array.from(list.querySelectorAll<HTMLElement>("[data-sidebar-link]"));
      const href = readyHref() ?? indicator.dataset.currentHref ?? lastSnapshot?.href;
      const active = links.find((link) => link.dataset.sidebarLink === href);
      if (active) place(active); else indicator.dataset.visible = "false";
    };
    update();
    const unsubscribePending = subscribeCatalogRoutePending(update);
    const observer = new ResizeObserver(update);
    observer.observe(list);
    list.querySelectorAll("nav, ul").forEach((node) => observer.observe(node));
    list.addEventListener("scroll", update, true);
    const contentObserver = new MutationObserver(update);
    contentObserver.observe(document.querySelector("main") ?? document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-catalog-secondary-ready", "data-catalog-secondary-route", "aria-busy"] });
    return () => {
      unsubscribePending();
      observer.disconnect();
      contentObserver.disconnect();
      list.removeEventListener("scroll", update, true);
      if (indicator.dataset.visible === "true" && list.getBoundingClientRect().width > 0) {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(indicator).transform);
        lastSnapshot = { href: indicator.dataset.currentHref ?? activeKey, position: { top: matrix.m42, left: matrix.m41, width: indicator.getBoundingClientRect().width, height: indicator.getBoundingClientRect().height } };
      }
    };
  }, [activeKey, layoutKey]);
  return <div ref={listRef} className={styles.frame}>
    <span ref={indicatorRef} data-testid="primary-nav-indicator" aria-hidden="true" className={styles.indicator} />
    {children}
  </div>;
}
