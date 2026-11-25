import { redirect } from "next/navigation";

export default function LegacyMyOrdersPage() {
  redirect("/account/orders");
}
