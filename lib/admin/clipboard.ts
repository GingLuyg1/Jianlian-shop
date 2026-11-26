"use client";

import { toast } from "sonner";

export async function copyAdminText(
  value: string | null | undefined,
  label = "内容"
): Promise<boolean> {
  const text = String(value ?? "").trim();
  if (!text) {
    toast.error(`暂无可复制的${label}`);
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`已复制${label}`);
    return true;
  } catch {
    toast.error(`复制${label}失败，请手动选中复制`);
    return false;
  }
}
