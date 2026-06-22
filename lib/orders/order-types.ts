import type { OrderStatus, PaymentStatus } from "./order-status";

export type OrderItemRecord = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  product_slug: string | null;
  product_image_url: string | null;
  category_name: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
  delivery_type: string | null;
  product_snapshot: Record<string, unknown> | null;
  created_at: string;
};

export type OrderLogRecord = {
  id: string;
  order_id: string;
  from_status: string | null;
  to_status: string;
  operator_id: string | null;
  operator_type: string | null;
  note: string | null;
  created_at: string;
};

export type OrderDeliveryRecord = {
  id: string;
  order_id: string;
  order_item_id: string | null;
  user_id?: string | null;
  product_id?: string | null;
  inventory_id?: string | null;
  delivery_type: string | null;
  delivery_content: string | null;
  delivery_status: string;
  delivered_at: string | null;
  viewed_at?: string | null;
  failure_reason?: string | null;
  delivery_note?: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderRecord = {
  id: string;
  order_no: string;
  user_id: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: string | null;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  currency: string;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  shipping_address: Record<string, unknown> | null;
  customer_note: string | null;
  admin_note: string | null;
  delivery_type: string | null;
  paid_at: string | null;
  processed_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  order_items?: OrderItemRecord[];
  order_status_logs?: OrderLogRecord[];
  order_deliveries?: OrderDeliveryRecord[];
};

export type OrderListResult = {
  orders: OrderRecord[];
  count: number;
};
