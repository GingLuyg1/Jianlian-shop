import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ClipboardList,
  FileLock2,
  Factory,
  ImageIcon,
  LayoutDashboard,
  MailCheck,
  Package,
  PackageCheck,
  RotateCcw,
  Route,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";

type AdminNavigationLink = {
  type: "link";
  label: string;
  href: string;
  icon: LucideIcon;
};

export type AdminNavigationGroup = {
  type: "group";
  label: string;
  icon: LucideIcon;
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
    label: "商品管理",
    icon: Package,
    children: [
      { label: "商品列表", href: "/admin/products" },
      { label: "分类管理", href: "/admin/categories" },
    ],
  },
  { type: "link", label: "数字库存", href: "/admin/inventory", icon: PackageCheck },
  { type: "link", label: "供应商管理", href: "/admin/suppliers", icon: Factory },
  { type: "link", label: "媒体资源", href: "/admin/media", icon: ImageIcon },
  { type: "link", label: "支付管理", href: "/admin/payments", icon: WalletCards },
  { type: "link", label: "充值管理", href: "/admin/recharges", icon: WalletCards },
  { type: "link", label: "订单管理", href: "/admin/orders", icon: ClipboardList },
  { type: "link", label: "售后退款", href: "/admin/refunds", icon: RotateCcw },
  { type: "link", label: "风险审核", href: "/admin/risk", icon: ShieldCheck },
  { type: "link", label: "用户管理", href: "/admin/users", icon: Users },
  { type: "link", label: "隐私请求", href: "/admin/privacy-requests", icon: FileLock2 },
  { type: "link", label: "邮件通知", href: "/admin/notifications/email-deliveries", icon: MailCheck },
  { type: "link", label: "系统设置", href: "/admin/settings", icon: Settings },
  { type: "link", label: "异常中心", href: "/admin/system-errors", icon: AlertTriangle },
  { type: "link", label: "请求追踪", href: "/admin/system/request-traces", icon: Route },
  { type: "link", label: "事务补偿", href: "/admin/system/compensations", icon: AlertTriangle },
  { type: "link", label: "数据库状态", href: "/admin/system/database", icon: ShieldCheck },
  { type: "link", label: "生产看板", href: "/admin/system/production-readiness", icon: ShieldCheck },
  { type: "link", label: "操作日志", href: "/admin/audit-logs", icon: ScrollText },
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
  return item.children.some((child) => isPathActive(pathname, child.href));
}

function isPathActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
