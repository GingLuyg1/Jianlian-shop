import { toast } from "sonner";

export async function copyWithFeedback(value: string, message = "已复制") {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(message);
  } catch {
    toast.error("复制失败，请手动复制");
  }
}
