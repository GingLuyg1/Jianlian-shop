import { redirect } from "next/navigation";

export default async function OrderTrackingPage(props: { searchParams?: Promise<{ id?: string; orderNo?: string }> }) {
  const searchParams = await props.searchParams;
  const orderNo = searchParams?.orderNo ?? searchParams?.id;
  redirect(orderNo ? `/order-query?orderNo=${encodeURIComponent(orderNo)}` : "/order-query");
}
