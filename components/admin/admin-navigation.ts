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
    key: "suppliers",
    label: "供应链管理",
    icon: Factory,
    routePrefixes: ["/admin/suppliers", "/admin/supplier-fulfillment"],
    children: [
      { label: "供应商管理", href: "/admin/suppliers" },
      { label: "供应商履约", href: "/admin/supplier-fulfillment" },
    ],
  },
  {
    type: "group",
    key: "trade",
    label: "订单与交易",
    icon: ClipboardList,
    routePrefixes: ["/admin/orders", "/admin/refunds", "/admin/risk"],
    children: [
      { label: "订单管理", href: "/admin/orders" },
      { label: "售后退款", href: "/admin/refunds" },
      { label: "风险审核", href: "/admin/risk" },
    ],
  },
  {
    type: "group",
    key: "finance",
    label: "财务管理",
    icon: Landmark,
    routePrefixes: ["/admin/finance", "/admin/payments", "/admin/recharges", "/admin/balance-ledger"],
    children: [
      { label: "财务看板", href: "/admin/finance" },
      { label: "支付管理", href: "/admin/payments" },
      { label: "充值管理", href: "/admin/recharges" },
      { label: "余额流水", href: "/admin/balance-ledger" },
    ],
  },
  {
    type: "group",
    key: "users",
    label: "用户与通信",
    icon: Users,
    routePrefixes: ["/admin/users", "/admin/privacy-requests", "/admin/notifications"],
    children: [
      { label: "用户管理", href: "/admin/users" },
      { label: "隐私请求", href: "/admin/privacy-requests" },
      { label: "邮件通知", href: "/admin/notifications/email-deliveries" },
    ],
  },
  { type: "link", label: "系统设置", href: "/admin/settings", icon: Settings },
  {
    type: "group",
    key: "system",
    label: "系统运营",
    icon: AlertTriangle,
    routePrefixes: ["/admin/system"],
    children: [
      { label: "生产看板", href: "/admin/system/production-readiness" },
      { label: "自动任务运行状态", href: "/admin/system/workers" },
      { label: "异常中心", href: "/admin/system-errors" },
      { label: "请求追踪", href: "/admin/system/request-traces" },
      { label: "事务补偿", href: "/admin/system/compensations" },
      { label: "数据库状态", href: "/admin/system/database" },
      { label: "操作日志", href: "/admin/audit-logs" },
    ],
  },
];

export function isAdminNavigationGroup(item: AdminNavigationItem): item is AdminNavigationGroup {
  return item.type === "group";
}

export function isAdminNavigationLinkActive(pathname: string, href: string, productView: string | null) {
  if (href === "/admin/categories") {
    return isPathActive(pathname, href) || (isPathActive(pathname, "/admin/products") && productView === "categories");
  }
  if (href === "/admin/products") {
    return isPathActive(pathname, href) && productView !== "categories";
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
