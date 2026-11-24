type PlainNavigationClick = {
  button: number;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  preventDefault: () => void;
};

export type CatalogRoutePending = { source: string; target: string };

const catalogCategoryPaths = new Set([
  "/products/sim-cards",
  "/products/gift-cards",
  "/products/digital-accounts",
  "/products/ai-membership",
  "/products/sms-code",
]);

export function isCatalogCategoryPath(pathname: string) {
  return catalogCategoryPaths.has(pathname);
}

let pendingNavigation: ReturnType<typeof setTimeout> | null = null;
let pendingRoute: CatalogRoutePending | null = null;
let intendedCategorySelection: { path: string; slug: string; id: string; queryParam: string; at: number } | null = null;
const listeners = new Set<() => void>();

export function subscribeCatalogRoutePending(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCatalogRoutePending() {
  return pendingRoute;
}

export function getServerCatalogRoutePending() {
  return null;
}

function publishPendingRoute(route: CatalogRoutePending | null) {
  pendingRoute = route;
  const shell = document.querySelector<HTMLElement>('[data-testid="storefront-category-layout"]');
  const productRail = shell?.querySelector<HTMLElement>('[data-wheel-container="products"]');
  if (route && route.source !== route.target) {
    shell?.setAttribute("data-route-exiting", "true");
    productRail?.setAttribute("inert", "");
    productRail?.setAttribute("aria-busy", "true");
  } else {
    shell?.removeAttribute("data-route-exiting");
    productRail?.removeAttribute("inert");
    productRail?.removeAttribute("aria-busy");
  }
  listeners.forEach((listener) => listener());
}

/** Clear only after a route commits, or when the user explicitly cancels. */
export function clearCatalogRoutePending() {
  if (pendingNavigation) clearTimeout(pendingNavigation);
  pendingNavigation = null;
  if (pendingRoute) publishPendingRoute(null);
}

/** A superseded route may commit after a newer click. Keep its products inert. */
export function rebaseCatalogRoutePending(pathname: string) {
  if (!pendingRoute || pendingRoute.target.split("?")[0] === pathname || !isCatalogCategoryPath(pathname)) return false;
  publishPendingRoute({ source: pathname, target: pendingRoute.target });
  return true;
}

/** Browser Back/Forward can start a route change without a sidebar click. */
export function startCatalogPopstate(currentPath: string, targetPath: string) {
  if (isCatalogCategoryPath(currentPath) && isCatalogCategoryPath(targetPath) && currentPath !== targetPath) {
    if (pendingNavigation) clearTimeout(pendingNavigation);
    pendingNavigation = null;
    publishPendingRoute({ source: currentPath, target: targetPath });
  }
}

/** Consume an intended 2nd-level category chosen during a pending 1st-level transition. */
export function consumeIntendedCatalogCategory(pathname: string) {
  if (!intendedCategorySelection) return null;
  const fresh = Date.now() - intendedCategorySelection.at < 10_000;
  if (fresh && intendedCategorySelection.path === pathname) {
    const match = intendedCategorySelection;
    intendedCategorySelection = null;
    return match;
  }
  if (!fresh) intendedCategorySelection = null;
  return null;
}

/** A verified destination rail may be used while its page payload is pending.
 * Supersede the scheduled default navigation instead of briefly locking the
 * secondary cards; the old product rail remains inert until route commit. */
export function selectPendingCatalogCategory(
  sourcePath: string,
  targetPath: string,
  navigate: () => void,
  selection?: { slug: string; id: string; queryParam: string }
) {
  if (!pendingRoute || pendingRoute.source !== sourcePath || pendingRoute.target.split("?")[0] !== targetPath) return false;
  if (pendingNavigation) clearTimeout(pendingNavigation);
  pendingNavigation = null;
  if (selection?.slug) {
    intendedCategorySelection = {
      path: targetPath,
      slug: selection.slug,
      id: selection.id,
      queryParam: selection.queryParam,
      at: Date.now(),
    };
    const qs = new URLSearchParams();
    qs.set(selection.queryParam, selection.slug);
    publishPendingRoute({ source: sourcePath, target: `${targetPath}?${qs.toString()}` });
  }
  navigate();
  return true;
}

/** Block old products before Next.js begins a potentially slow route request. */
export function startCatalogRouteExit(event: PlainNavigationClick, currentPath: string, targetPath: string, navigate: () => void) {
  if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  if (!isCatalogCategoryPath(currentPath) || !isCatalogCategoryPath(targetPath)) return false;
  if (currentPath === targetPath) {
    if (pendingRoute) {
      event.preventDefault();
      if (pendingNavigation) {
        // The old route was never dispatched; cancel without a new navigation.
        clearCatalogRoutePending();
      } else {
        // An old RSC request may still commit. Remember the user's final choice
        // without making the already visible source page inert.
        publishPendingRoute({ source: currentPath, target: currentPath });
        navigate();
      }
      return true;
    }
    return false;
  }
  event.preventDefault();
  if (pendingNavigation) clearTimeout(pendingNavigation);
  publishPendingRoute({ source: currentPath, target: targetPath });
  navigate();
  pendingNavigation = setTimeout(() => {
    pendingNavigation = null;
    if (typeof window !== "undefined" && window.location.pathname !== targetPath) {
      window.location.assign(targetPath);
    }
  }, 1200);
  return true;
}
