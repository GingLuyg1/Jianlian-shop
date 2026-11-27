type PlainNavClickEvent = {
  button: number;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  preventDefault: () => void;
};

/**
 * 帮助中心（使用教程、工单中心）与「我的」（账号充值、推广中心、订单查询、个人中心）
 * 统一路由退出 / 进入转场动画控制。
 * 退场约 170ms，同时并发 prefetch 目标页面，丝滑衔接目标页入场动效。
 */
export const STOREFRONT_PAGE_EXIT_DURATION_MS = 170;

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

let exitNavigateTimer: ReturnType<typeof setTimeout> | null = null;
let exitSafetyResetTimer: ReturnType<typeof setTimeout> | null = null;

function setStageExiting(exiting: boolean) {
  if (typeof document === "undefined") return;
  const stage = document.querySelector<HTMLElement>('[data-storefront-page-stage="true"]');
  if (!stage) return;
  if (exiting) {
    stage.setAttribute("data-page-exiting", "true");
  } else {
    stage.removeAttribute("data-page-exiting");
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

  // 仅当离开或进入「帮助中心 / 我的」目标页面时触发优雅退场衔接
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

  // 在退场动画播放期间提前抢跑加载目标路由资源
  try {
    prefetch?.();
  } catch {
    // ignore prefetch failures
  }

  setStageExiting(true);

  exitNavigateTimer = setTimeout(() => {
    exitNavigateTimer = null;
    navigate();
  }, STOREFRONT_PAGE_EXIT_DURATION_MS);

  // 兜底清除，防止偶发网络取消导致内容区停留在透明状态
  exitSafetyResetTimer = setTimeout(() => {
    exitSafetyResetTimer = null;
    setStageExiting(false);
  }, 1800);

  return true;
}
