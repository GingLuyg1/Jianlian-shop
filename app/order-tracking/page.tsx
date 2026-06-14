import { redirect } from "next/navigation";

export default function OrderTrackingPage({
  searchParams,
}: {
  searchParams?: { id?: string };
}) {
  const id = searchParams?.id;
  redirect(id ? `/account/orders?id=${encodeURIComponent(id)}` : "/account/orders");
}
