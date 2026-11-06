import { Code2, FileLock2, Shield, WalletCards } from "lucide-react";

// Keep the account dropdown and personal-center navigation in the same order.
export const accountNavigation = [
  { label: "账号资料", href: "/account", icon: WalletCards },
  { label: "账号安全", href: "/account/security", icon: Shield },
  { label: "隐私设置", href: "/account/privacy", icon: FileLock2 },
  { label: "API 接口", href: "/account/api", icon: Code2 },
];
