type PlainNavClickEvent = {
  button: number;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  preventDefault: () => void;
};

/**
 * 方案 D · 方向感联动滑移（Directional Slide）：
 * - 退场缓冲 400ms（与演示台滑块 400ms 及侧边栏滑块同频），同时并发 prefetch 抢跑加载目标页面；
 * - 入场 760ms cubic-bezier(0.16, 1, 0.3, 1)，根据侧边栏菜单上下顺序智能决定上滑/下滑方向。
 */
export const STOREFRONT_PAGE_EXIT_DURATION_MS = 400;

export type StorefrontPageDirection = "down" | "up";

const ANIMATED_PAGE_PREFIXES = [
  "/tutorials",
  "/faq",
  "/products/account-recharge",
  "/promotion",
  "/account/orders",
  "/account",
] as const;

export function isAnimatedStorefrontPagePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const clean = pathname.split("?")[0];
  return ANIMATED_PAGE_PREFIXES.some((prefix) => clean === prefix || clean.startsWith(`${prefix}/`));
}

/**
 * 归类主模块标识：
 * - `/account/orders`（订单查询）与 `/account`（个人中心）分属两个一级导航，互相切换时触发完整进退场动画；
 * - 个人中心内部子页（账号资料 / 安全 / 隐私 / API）切换保留自身局部过渡，不重刷整个外框。
 */
export function getStorefrontPageTransitionGroup(pathname: string | null | undefined): string {
  const clean = (pathname ?? "").split("?")[0];
  if (clean === "/tutorials" || clean.startsWith("/tutorials/")) return "tutorials";
  if (clean === "/faq" || clean.startsWith("/faq/")) return "faq";
  if (clean === "/products/account-recharge" || clean.startsWith("/products/account-recharge/")) return "account-recharge";
  if (clean === "/promotion" || clean.startsWith("/promotion/")) return "promotion";
  if (clean === "/account/orders" || clean.startsWith("/account/orders/")) return "orders";
  if (clean === "/account" || clean.startsWith("/account/")) return "account";
  return clean || "other";
}

function getStorefrontSidebarRank(pathname: string | null | undefined): number {
  const clean = (pathname ?? "").split("?")[0];
  if (clean === "/") return 0;
  if (clean === "/products/all" || clean.startsWith("/products/all/")) return 1;
  if (clean.startsWith("/products/sim-cards")) return 2;
  if (clean.startsWith("/products/gift-cards")) return 3;
  if (clean.startsWith("/products/digital-accounts")) return 4;
  if (clean.startsWith("/products/ai-membership")) return 5;
  if (clean === "/tutorials" || clean.startsWith("/tutorials/")) return 10;
  if (clean === "/faq" || clean.startsWith("/faq/")) return 11;
  if (clean === "/products/account-recharge" || clean.startsWith("/products/account-recharge/")) return 20;
  if (clean === "/promotion" || clean.startsWith("/promotion/")) return 21;
  if (clean === "/account/orders" || clean.startsWith("/account/orders/")) return 22;
  if (clean === "/account" || clean.startsWith("/account/")) return 23;
  return 15;
}

let exitNavigateTimer: ReturnType<typeof setTimeout> | null = null;
let exitSafetyResetTimer: ReturnType<typeof setTimeout> | null = null;
let lastTransitionDirection: StorefrontPageDirection = "down";

export function getLastStorefrontPageDirection(): StorefrontPageDirection {
  return lastTransitionDirection;
}

function setStageExiting(exiting: boolean, direction?: StorefrontPageDirection) {
  if (typeof document === "undefined") return;
  const stage = document.querySelector<HTMLElement>('[data-storefront-page-stage="true"]');
  if (!stage) return;
  if (exiting) {
    stage.setAttribute("data-page-exiting", "true");
    stage.setAttribute("data-page-direction", direction ?? lastTransitionDirection);
  } else {
    stage.removeAttribute("data-page-exiting");
    stage.removeAttribute("data-page-direction");
  }
}

export function clearStorefrontPageExit() {
  if (exitNavigateTimer) {
    clearTimeout(exitNavigateTimer);
    exitNavigateTimer = null;
  }
  if (exitSafetyResetTimer) {
    clearTimeout(exitSafetyResetTimer);
    exitSafetyResetTimer = null;
  }
  setStageExiting(false);
}

export function startStorefrontPageExit(
  event: PlainNavClickEvent,
  currentPath: string,
  targetHref: string,
  navigate: () => void,
  prefetch?: () => void
): boolean {
  if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  const targetPath = targetHref.split("?")[0];
  const currentGroup = getStorefrontPageTransitionGroup(currentPath);
  const targetGroup = getStorefrontPageTransitionGroup(targetPath);

  // 同页面或同一导航模块内不做退场延迟
  if (currentPath === targetPath || currentGroup === targetGroup) return false;

  // 仅当离开或进入「帮助中心 / 我的」目标页面时触发方向感联动滑移
  if (!isAnimatedStorefrontPagePath(currentPath) && !isAnimatedStorefrontPagePath(targetPath)) {
    return false;
  }

  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return false;
  }

  event.preventDefault();
  if (exitNavigateTimer) clearTimeout(exitNavigateTimer);
  if (exitSafetyResetTimer) clearTimeout(exitSafetyResetTimer);

  const currentRank = getStorefrontSidebarRank(currentPath);
  const targetRank = getStorefrontSidebarRank(targetPath);
  const direction: StorefrontPageDirection = targetRank >= currentRank ? "down" : "up";
  lastTransitionDirection = direction;

  // 在 400ms 退场缓冲期间提前抢跑预加载目标页面资源
  try {
    prefetch?.();
  } catch {
    // ignore prefetch failures
  }

  setStageExiting(true, direction);

  exitNavigateTimer = setTimeout(() => {
    exitNavigateTimer = null;
    navigate();
  }, STOREFRONT_PAGE_EXIT_DURATION_MS);

  // 兜底清除，防止偶发网络取消导致内容区停留在透明状态
  exitSafetyResetTimer = setTimeout(() => {
    exitSafetyResetTimer = null;
    setStageExiting(false);
  }, 2400);

  return true;
}
