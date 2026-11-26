import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ClipboardList,
  Factory,
  FileLock2,
  ImageIcon,
  Landmark,
  LayoutDashboard,
  MailCheck,
  Package,
  PackageCheck,
  RotateCcw,
  Settings,
  Share2,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";
import {
  getNavigationGroupForPath,
  isAdminPathActive,
} from "./admin-navigation-state.mjs";

export type AdminNavigationGroupKey = "products" | "suppliers" | "trade" | "finance" | "users" | "system";

type AdminNavigationLink = {
  type: "link";
  label: string;
  href: string;
  icon: LucideIcon;
};

export type AdminNavigationGroup = {
  type: "group";
  key: AdminNavigationGroupKey;
  label: string;
  icon: LucideIcon;
  routePrefixes?: readonly string[];
  children: readonly {
    label: string;
    href: string;
  }[];
};

export type AdminNavigationItem = AdminNavigationLink | AdminNavigationGroup;

export const adminNavigationItems: readonly AdminNavigationItem[] = [
  { type: "link", label: "控制台", href: "/admin", icon: LayoutDashboard },
  {
    type: "group",
    key: "products",
    label: "商品与库存",
    icon: Package,
    routePrefixes: ["/admin/products", "/admin/categories", "/admin/inventory", "/admin/media"],
    children: [
      { label: "商品列表", href: "/admin/products" },
      { label: "分类管理", href: "/admin/categories" },
      { label: "数字库存", href: "/admin/inventory" },
      { label: "媒体资源", href: "/admin/media" },
    ],
  },
  {
    type: "group",
    key: "trade",
    label: "订单与售后",
    icon: ClipboardList,
    routePrefixes: ["/admin/orders", "/admin/coupons", "/admin/refunds", "/admin/tickets"],
    children: [
      { label: "订单管理", href: "/admin/orders" },
      { label: "优惠券管理", href: "/admin/coupons" },
      { label: "售后退款", href: "/admin/refunds" },
      { label: "工单处理", href: "/admin/tickets" },
    ],
  },
  {
    type: "group",
    key: "finance",
    label: "财务与报表",
    icon: Landmark,
    routePrefixes: ["/admin/finance", "/admin/reports", "/admin/payments", "/admin/recharges", "/admin/balance-ledger"],
    children: [
      { label: "财务与报表", href: "/admin/finance" },
      { label: "支付管理", href: "/admin/payments" },
      { label: "充值管理", href: "/admin/recharges" },
      { label: "余额流水", href: "/admin/balance-ledger" },
    ],
  },
  {
    type: "group",
    key: "suppliers",
    label: "供应链管理",
    icon: Factory,
    routePrefixes: ["/admin/suppliers", "/admin/supplier-fulfillment"],
    children: [
      { label: "供应商管理", href: "/admin/suppliers" },
      { label: "供应商采购订单", href: "/admin/supplier-fulfillment" },
    ],
  },
  {
    type: "group",
    key: "users",
    label: "用户与分销",
    icon: Users,
    routePrefixes: ["/admin/users", "/admin/privacy-requests", "/admin/agents", "/admin/notifications"],
    children: [
      { label: "用户管理", href: "/admin/users" },
      { label: "代理与分销", href: "/admin/agents" },
      { label: "邮件通知", href: "/admin/notifications/email-deliveries" },
    ],
  },
  { type: "link", label: "系统设置", href: "/admin/settings", icon: Settings },
  {
    type: "group",
    key: "system",
    label: "系统运维",
    icon: AlertTriangle,
    routePrefixes: ["/admin/system", "/admin/system-errors", "/admin/risk", "/admin/audit-logs"],
    children: [
      { label: "操作日志", href: "/admin/audit-logs" },
      { label: "运维排障工具箱", href: "/admin/system/toolbox" },
    ],
  },
];

export function isAdminNavigationGroup(item: AdminNavigationItem): item is AdminNavigationGroup {
  return item.type === "group";
}

export function isAdminNavigationLinkActive(
  pathname: string,
  href: string,
  productView: string | null,
  agentTab?: string | null
) {
  if (href === "/admin/categories") {
    return isPathActive(pathname, href) || (isPathActive(pathname, "/admin/products") && productView === "categories");
  }
  if (href === "/admin/products") {
    return isPathActive(pathname, href) && productView !== "categories";
  }
  if (href === "/admin/finance") {
    return isPathActive(pathname, "/admin/finance") || isPathActive(pathname, "/admin/reports");
  }
  if (href === "/admin/users") {
    return isPathActive(pathname, "/admin/users") || isPathActive(pathname, "/admin/privacy-requests");
  }
  if (href === "/admin/system/toolbox") {
    return (
      isPathActive(pathname, "/admin/system") ||
      isPathActive(pathname, "/admin/system-errors") ||
      isPathActive(pathname, "/admin/risk")
    );
  }
  if (href === "/admin/agents") {
    void agentTab;
    return isPathActive(pathname, "/admin/agents");
  }
  return isPathActive(pathname, href);
}

export function isAdminNavigationGroupActive(pathname: string, item: AdminNavigationGroup) {
  return getAdminNavigationGroup(pathname) === item.key;
}

export function getAdminNavigationGroup(pathname: string): AdminNavigationGroupKey | null {
  return getNavigationGroupForPath(
    pathname,
    adminNavigationItems.filter(isAdminNavigationGroup)
  ) as AdminNavigationGroupKey | null;
}

const isPathActive = isAdminPathActive;
