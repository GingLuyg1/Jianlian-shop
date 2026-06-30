import { redirect } from "next/navigation";

export default function OrderTrackingPage({ searchParams }: { searchParams?: { id?: string; orderNo?: string } }) {
  const orderNo = searchParams?.orderNo ?? searchParams?.id;
  redirect(orderNo ? `/order-query?orderNo=${encodeURIComponent(orderNo)}` : "/order-query");
}
