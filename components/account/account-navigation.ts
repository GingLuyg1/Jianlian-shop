import { Code2, FileLock2, Shield, UserCircle, WalletCards } from "lucide-react";

// Keep the account dropdown and personal-center navigation in the same order.
export const accountNavigation = [
  { label: "账号资料", description: "账户余额与会员权益", href: "/account", icon: WalletCards },
  { label: "个人资料", description: "联系信息与常用地址", href: "/account/profile", icon: UserCircle },
  { label: "账号安全", description: "登录密码与安全验证", href: "/account/security", icon: Shield },
  { label: "隐私设置", description: "个人数据与隐私请求", href: "/account/privacy", icon: FileLock2 },
  { label: "API 接口", description: "商户信息与接口服务", href: "/account/api", icon: Code2 },
];
